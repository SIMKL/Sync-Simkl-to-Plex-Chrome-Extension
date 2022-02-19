package main

import (
	"io/ioutil"
	"log"
	"os"
)

func main() {

	// TODO: use os.Link to create
	// convincing plex test cases

	err := ioutil.WriteFile("original.txt", []byte("hello world"), 0600)
	if err != nil {
		log.Fatalln(err)
	}

	err = os.Remove("link.txt")
	if err != nil {
		log.Fatalln(err)
	}

	err = os.Link("original.txt", "link.txt")
	if err != nil {
		log.Fatalln(err)
	}
}
