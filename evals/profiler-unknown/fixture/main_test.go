package main

import "testing"

func TestGreet(t *testing.T) {
	if got := Greet("Ada"); got != "Hello, Ada" {
		t.Fatalf("got %q", got)
	}
}
