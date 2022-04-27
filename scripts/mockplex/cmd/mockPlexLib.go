package main

import (
	_ "embed"
	"encoding/gob"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

//go:embed sample.webm
var goldenWebm []byte

type File string
type Directory struct {
	Name  string       `json:"name"`
	Dirs  []*Directory `json:"dirs,omitempty"`
	Files []*File      `json:"files,omitempty"`
}

func (d Directory) Save(filename string) (err error) {
	file, err := os.OpenFile(filename, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
	defer func() {
		err = file.Sync()
		if err != nil {
			err = fmt.Errorf("flushErr: [%w]", err)
			return
		}
		err = file.Close()
		if err != nil {
			err = fmt.Errorf("closeErr: [%w]", err)
			return
		}
	}()
	enc := gob.NewEncoder(file)
	err = enc.Encode(d)
	if err != nil {
		return fmt.Errorf("encodeErr: [%w]", err)
	}
	return err
}

func (d *Directory) LoadSave(filename string) (err error) {
	file, err := os.Open(filename)
	defer func() {
		err = file.Close()
		if err != nil {
			err = fmt.Errorf("closeErr: [%w]", err)
		}
	}()
	if err != nil {
		err = fmt.Errorf("openErr: [%w]", err)
	}
	dec := gob.NewDecoder(file)
	err = dec.Decode(d)
	if err != nil {
		err = fmt.Errorf("decodeErr: [%w]", err)
	}
	return
}

func (d Directory) String() string {
	return fmt.Sprintf("%#v", d)
}

func (d Directory) DebugString() string {
	dx, _ := json.MarshalIndent(d, "", "  ")
	return string(dx)
}

func (d *Directory) LoadFromDir(root string) (err error) {
	if d.Dirs == nil {
		d.Dirs = []*Directory{}
	}
	if d.Files == nil {
		d.Files = []*File{}
	}
	dirs, err := os.ReadDir(root)
	for _, item := range dirs {
		if item.IsDir() {
			cdir := &Directory{Name: item.Name()}
			d.Dirs = append(d.Dirs, cdir)
			cdir.LoadFromDir(filepath.Join(root, item.Name()))
		} else {
			ff := File(item.Name())
			d.Files = append(d.Files, &ff)
		}
	}
	return
}

func (d Directory) SaveToDisk(root string) (err error) {
	for _, f := range d.Files {
		var ff *os.File
		ff, err = os.Create(filepath.Join(root, string(*f)))
		if err != nil {
			err = fmt.Errorf("fileCreateErr: [%w]", err)
			return
		}
		_, err = ff.Write(goldenWebm)
		if err != nil {
			err = fmt.Errorf("fileWriteErr: [%w]", err)
			return
		}
		err = ff.Close()
		if err != nil {
			err = fmt.Errorf("fileCloseErr: [%w]", err)
			return
		}
	}
	for _, dr := range d.Dirs {
		err = os.MkdirAll(filepath.Join(root, dr.Name), os.ModeDir)
		if err != nil {
			err = fmt.Errorf("mkdirall: [%w]", err)
			return
		}
		dr.SaveToDisk(filepath.Join(root, dr.Name))
	}
	return
}

func usage(status int) {
	if status == 1 {
		fmt.Println("Wrong usage:", strings.Join(os.Args, " "))
	}
	fmt.Printf("Usage: %s help|load|save\n", os.Args[0])
	fmt.Println("\thelp\t\t\t show this message and exit")
	fmt.Println("\tload <tree.bin> <dest>\t load tree structure to destination")
	fmt.Println("\tsave <dir> <tree.bin>\t save tree structure to disk")
	os.Exit(status)
}

var verbose = (os.Getenv("SIMKL2PLEX_VERBOSE") != "" &&
	os.Getenv("SIMKL2PLEX_VERBOSE") != "false")

func main() {
	if len(os.Args) == 1 {
		usage(1)
	}
	if os.Args[1] == "help" {
		usage(0)
	}
	if os.Args[1] == "load" {
		var err error
		restored := &Directory{}
		err = restored.LoadSave(os.Args[2])
		if err != nil {
			panic(err)
		}
		if verbose {
			fmt.Println(restored.DebugString())
		}
		var savedir string
		if len(os.Args) == 3 {
			savedir, err = os.MkdirTemp("", "")
			fmt.Println("save dir", savedir)
		} else if len(os.Args) == 4 {
			savedir = os.Args[3]
		} else {
			usage(1)
		}
		if err != nil {
			panic(err)
		}
		err = restored.SaveToDisk(savedir)
		if err != nil {
			panic(err)
		}
	} else if os.Args[1] == "save" {
		var err error
		var filename string
		if len(os.Args) == 3 {
			filename = "simkl.tree.bin"
			fmt.Println("saving dir tree to", filename)
		} else if len(os.Args) == 4 {
			filename = os.Args[3]
		} else {
			usage(1)
		}
		saved := Directory{Name: os.Args[2]}
		err = saved.LoadFromDir(os.Args[2])
		if err != nil {
			panic(err)
		}
		saved.Save(os.Args[3])
		if verbose {
			fmt.Println(saved.DebugString())
		}
	} else {
		fmt.Printf("unknown command: %s use %s help for usage help.\n", os.Args[1], os.Args[0])
		os.Exit(1)
	}
}
