// Package fcd1 — ortak çekirdeğin FCD1 ikili yama biçiminin Go uygulayıcısı.
//
// Biçim: ortak-cekirdek/delta/FORMAT.md (kopyası: cekirdek/FCD1-FORMAT.md). Başlık 85 bayt:
//
//	"FCD1" | codec (0x01 = zlib) | srcLen u64 LE | srcSha256 (32) | dstLen u64 LE | dstSha256 (32) | zlib(op akışı)
//
// Op akışı: 0x00 END · 0x01 COPY varint(off) varint(len) · 0x02 INSERT varint(len) + bayt.
// varint işaretsiz LEB128, en çok 9 bayt / 63 bit. Her uyumsuzlukta hata döner; çağıran tam dosyaya geçer.
package fcd1

import (
	"bufio"
	"bytes"
	"compress/zlib"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

// HeaderLen sabit başlık uzunluğu.
const HeaderLen = 85

// Hata kodları (çekirdeğin Node uygulayıcısıyla aynı adlar).
var (
	ErrBadMagic       = errors.New("PATCH_BAD_MAGIC")
	ErrBadCodec       = errors.New("PATCH_BAD_CODEC")
	ErrBadHeader      = errors.New("PATCH_BAD_HEADER")
	ErrSourceMismatch = errors.New("PATCH_SOURCE_MISMATCH")
	ErrBadStream      = errors.New("PATCH_BAD_STREAM")
	ErrTruncated      = errors.New("PATCH_TRUNCATED")
	ErrBadVarint      = errors.New("PATCH_BAD_VARINT")
	ErrBadCopy        = errors.New("PATCH_BAD_COPY")
	ErrTooLong        = errors.New("PATCH_TOO_LONG")
	ErrBadOp          = errors.New("PATCH_BAD_OP")
	ErrNoEnd          = errors.New("PATCH_NO_END")
	ErrTrailing       = errors.New("PATCH_TRAILING_DATA")
	ErrResult         = errors.New("PATCH_RESULT_MISMATCH")
)

// Header yamanın başlığı.
type Header struct {
	SrcLen uint64
	SrcSha [32]byte
	DstLen uint64
	DstSha [32]byte
}

// ParseHeader başlığı okur ve denetler.
func ParseHeader(patch []byte) (Header, error) {
	var h Header
	if len(patch) < HeaderLen || string(patch[:4]) != "FCD1" {
		return h, ErrBadMagic
	}
	if patch[4] != 0x01 {
		return h, ErrBadCodec
	}
	h.SrcLen = binary.LittleEndian.Uint64(patch[5:13])
	copy(h.SrcSha[:], patch[13:45])
	h.DstLen = binary.LittleEndian.Uint64(patch[45:53])
	copy(h.DstSha[:], patch[53:85])
	if h.SrcLen > 1<<53 || h.DstLen > 1<<53 {
		return h, ErrBadHeader
	}
	return h, nil
}

// countingReader zlib akışının tükettiği baytları sayar (akıştan sonra fazladan bayt kalmasın).
type countingReader struct {
	r *bytes.Reader
}

func (c *countingReader) Read(p []byte) (int, error) { return c.r.Read(p) }
func (c *countingReader) ReadByte() (byte, error)    { return c.r.ReadByte() }

func readVarint(r io.ByteReader) (uint64, error) {
	var v uint64
	var shift uint
	for n := 0; n < 9; n++ {
		b, err := r.ReadByte()
		if err != nil {
			return 0, ErrTruncated
		}
		v |= uint64(b&0x7f) << shift
		if b < 0x80 {
			if v > 1<<63-1 {
				return 0, ErrBadVarint
			}
			return v, nil
		}
		shift += 7
	}
	return 0, ErrBadVarint
}

// Apply eski dosyaya (src) yamayı uygular ve yeni dosyayı döndürür. Kaynak ve sonuç uzunluk + SHA-256 ile doğrulanır.
func Apply(src, patch []byte) ([]byte, error) {
	h, err := ParseHeader(patch)
	if err != nil {
		return nil, err
	}
	if uint64(len(src)) != h.SrcLen || sha256.Sum256(src) != h.SrcSha {
		return nil, ErrSourceMismatch
	}
	body := &countingReader{r: bytes.NewReader(patch[HeaderLen:])}
	zr, err := zlib.NewReader(body)
	if err != nil {
		return nil, ErrBadStream
	}
	ops := bufio.NewReaderSize(zr, 64*1024)
	out := make([]byte, 0, h.DstLen)
	ended := false
	for !ended {
		op, err := ops.ReadByte()
		if err != nil {
			if err == io.EOF {
				return nil, ErrNoEnd
			}
			return nil, ErrBadStream
		}
		switch op {
		case 0x00:
			ended = true
		case 0x01:
			off, err := readVarint(ops)
			if err != nil {
				return nil, err
			}
			n, err := readVarint(ops)
			if err != nil {
				return nil, err
			}
			if off > uint64(len(src)) || n > uint64(len(src))-off {
				return nil, ErrBadCopy
			}
			if uint64(len(out))+n > h.DstLen {
				return nil, ErrTooLong
			}
			out = append(out, src[off:off+n]...)
		case 0x02:
			n, err := readVarint(ops)
			if err != nil {
				return nil, err
			}
			if uint64(len(out))+n > h.DstLen {
				return nil, ErrTooLong
			}
			start := len(out)
			out = append(out, make([]byte, n)...)
			if _, err := io.ReadFull(ops, out[start:]); err != nil {
				return nil, ErrTruncated
			}
		default:
			return nil, ErrBadOp
		}
	}
	// END'den sonra açılmış veride bayt kalmamalı, zlib akışı (Adler-32 dahil) bitmeli.
	var one [1]byte
	if n, err := io.ReadFull(ops, one[:]); n > 0 {
		return nil, ErrTrailing
	} else if err != nil && err != io.EOF && err != io.ErrUnexpectedEOF {
		return nil, ErrBadStream
	}
	if err := zr.Close(); err != nil {
		return nil, ErrBadStream
	}
	// zlib akışından sonra dosyada fazladan bayt olmamalı.
	if body.r.Len() != 0 {
		return nil, ErrTrailing
	}
	if uint64(len(out)) != h.DstLen || sha256.Sum256(out) != h.DstSha {
		return nil, ErrResult
	}
	return out, nil
}

// Describe hata ayıklama için kısa özet.
func Describe(patch []byte) string {
	h, err := ParseHeader(patch)
	if err != nil {
		return err.Error()
	}
	return fmt.Sprintf("FCD1 %d → %d bayt", h.SrcLen, h.DstLen)
}
