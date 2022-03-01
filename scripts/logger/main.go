package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("Starting logger server on localhost:3000")
	http.HandleFunc("/", logreq)
	http.ListenAndServe(":3000", nil)
}

type responseFormat struct {
	Index      int    `json:"index"`
	ClientTime string `json:"clientTime"`
	LogLevel   string `json:"logLevel"`
	Type       string `json:"type"`
	Args       string `json:"args"`
}

func logreq(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	fmt.Fprintf(w, "ok")
	decoder := json.NewDecoder(req.Body)
	var t responseFormat
	err := decoder.Decode(&t)
	if err != nil {
		panic(err)
	}
	if len(t.Args) > 200 {
		t.Args = t.Args[:200] + "..."
	}
	fmt.Printf("%+v\n", t)
}
