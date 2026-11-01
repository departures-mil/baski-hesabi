//go:build !windows

// Yalnızca sınama içindir; ürün sürümü Windows'ta çalışır.
package main

import "os/exec"

func openWindow(addr string) *exec.Cmd { println("pencere:", addr); return nil }
func revealInExplorer(path string)     {}
func fatal(msg string)                 { println("HATA:", msg) }
