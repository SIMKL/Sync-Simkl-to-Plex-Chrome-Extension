package main

import (
	"fmt"
	"log"
	"os"
)

func main() {
	// TODO: use os.Link to create
	// convincing plex test cases
	original := "sample.webm"
	var err error

	os.Mkdir("links", os.ModeDir)
	// max harlink count on windows is 1024
	// and the original file is also a harlink
	for i := 0; i < 1023; i += 1 {
		fname := fmt.Sprintf("links/link%04d.webm", i+1)
		os.Remove(fname)
		err = os.Link(original, fname)
		if err != nil {
			log.Fatalln(err)
		}
	}
}
