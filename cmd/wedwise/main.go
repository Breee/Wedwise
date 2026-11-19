// Command wedwise is the client for a Wedwise site: it signs in through the
// browser and then edits content and invite links from the terminal. It can be
// signed in to several sites at once, one of which is the current one.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/zalando/go-keyring"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

const usage = `wedwise – client for a Wedwise site

  wedwise login <url>            sign in through the browser
  wedwise logout                 sign out and forget the site
  wedwise hosts                  list the sites you are signed in to
  wedwise use <host>             make another site the current one
  wedwise status                 show what is still missing on the site
  wedwise content export [file]  save all content (default: standard output)
  wedwise content import <file>  replace all content from a file
  wedwise invite create          create an invite link
  wedwise mcp                    serve the site to an AI agent (MCP over stdio)

Commands work on the current site. Pick another one with --host <host>
or the WEDWISE_HOST environment variable. For scripts, WEDWISE_TOKEN
together with WEDWISE_HOST replaces the stored sign-in.
`

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "wedwise:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	host := os.Getenv("WEDWISE_HOST")
	var rest []string
	for i := 0; i < len(args); i++ {
		switch {
		case args[i] == "--host" && i+1 < len(args):
			host = args[i+1]
			i++
		case strings.HasPrefix(args[i], "--host="):
			host = strings.TrimPrefix(args[i], "--host=")
		default:
			rest = append(rest, args[i])
		}
	}
	if len(rest) == 0 {
		fmt.Print(usage)
		return nil
	}
	store, err := loadStore()
	if err != nil {
		return err
	}
	command := strings.Join(rest[:min(2, len(rest))], " ")
	switch {
	case rest[0] == "help" || rest[0] == "--help" || rest[0] == "-h":
		fmt.Print(usage)
		return nil
	case rest[0] == "login":
		if len(rest) != 2 {
			return errors.New("usage: wedwise login <url>")
		}
		return login(store, rest[1])
	case rest[0] == "hosts":
		return hosts(store)
	case rest[0] == "use":
		if len(rest) != 2 {
			return errors.New("usage: wedwise use <host>")
		}
		if _, ok := store.Hosts[rest[1]]; !ok {
			return fmt.Errorf("not signed in to %s", rest[1])
		}
		store.Current = rest[1]
		return store.save()
	}

	site, err := store.site(host)
	if err != nil {
		return err
	}
	switch {
	case rest[0] == "logout":
		return logout(store, site)
	case rest[0] == "status":
		return status(site)
	case command == "content export":
		return exportContent(site, rest[2:])
	case command == "content import" && len(rest) == 3:
		return importContent(site, rest[2])
	case command == "invite create":
		return createInvite(site)
	case rest[0] == "mcp":
		return serveMCP(site, os.Stdin, os.Stdout)
	}
	return fmt.Errorf("unknown command %q, see wedwise help", strings.Join(rest, " "))
}

// keyringService names the entries in the system keyring; the user is the host.
const keyringService = "wedwise"

// Store is the list of known sites, keyed by host name. Tokens live in the
// system keyring; the file only carries one where no keyring is available.
type Store struct {
	Current string          `json:"current"`
	Hosts   map[string]Site `json:"hosts"`
	path    string
}

type Site struct {
	URL   string `json:"url"`
	Token string `json:"token,omitempty"`
	host  string
}

func loadStore() (*Store, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	store := &Store{Hosts: map[string]Site{}, path: filepath.Join(dir, "wedwise", "credentials.json")}
	data, err := os.ReadFile(store.path)
	if errors.Is(err, os.ErrNotExist) {
		return store, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(data, store); err != nil {
		return nil, fmt.Errorf("%s: %w", store.path, err)
	}
	if store.Hosts == nil {
		store.Hosts = map[string]Site{}
	}
	return store, nil
}

func (s *Store) save() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0o600)
}

func (s *Store) site(host string) (Site, error) {
	if host == "" {
		host = s.Current
	}
	if host == "" {
		return Site{}, errors.New("not signed in, run: wedwise login <url>")
	}
	given := host
	if u, err := url.Parse(host); err == nil && u.Host != "" {
		host = u.Host
	}
	address := "https://" + host
	if u, err := url.Parse(given); err == nil && u.Host != "" {
		address = u.Scheme + "://" + u.Host
	}
	site, ok := s.Hosts[host]
	if token := os.Getenv("WEDWISE_TOKEN"); token != "" {
		if !ok {
			site.URL = address
		}
		site.Token, site.host = token, host
		return site, nil
	}
	if !ok {
		return Site{}, fmt.Errorf("not signed in to %s, run: wedwise login https://%s", host, host)
	}
	site.host = host
	if site.Token == "" {
		token, err := keyring.Get(keyringService, host)
		if err != nil {
			return Site{}, fmt.Errorf("no sign-in for %s in the system keyring, run: wedwise login %s", host, site.URL)
		}
		site.Token = token
		return site, nil
	}
	// A token still in the file moves into the keyring once one is available.
	if keyring.Set(keyringService, host, site.Token) == nil {
		s.Hosts[host] = Site{URL: site.URL}
		if err := s.save(); err != nil {
			return Site{}, err
		}
	}
	return site, nil
}

var client = &http.Client{Timeout: 30 * time.Second}

// call sends a JSON request and decodes the answer into out when given.
func call(site Site, method, path string, body, out any) (int, error) {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return 0, err
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, site.URL+path, reader)
	if err != nil {
		return 0, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if site.Token != "" {
		req.Header.Set("Authorization", "Bearer "+site.Token)
	}
	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if err != nil {
		return resp.StatusCode, err
	}
	if resp.StatusCode >= 300 {
		var problem struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(data, &problem)
		if resp.StatusCode == http.StatusUnauthorized {
			return resp.StatusCode, fmt.Errorf("the sign-in for %s is no longer valid, run: wedwise login %s", site.host, site.URL)
		}
		if problem.Error.Message == "" {
			problem.Error.Message = resp.Status
		}
		return resp.StatusCode, errors.New(problem.Error.Message)
	}
	if out != nil && len(data) > 0 {
		if raw, ok := out.(*[]byte); ok {
			*raw = data
			return resp.StatusCode, nil
		}
		return resp.StatusCode, json.Unmarshal(data, out)
	}
	return resp.StatusCode, nil
}

func login(store *Store, address string) error {
	if !strings.Contains(address, "://") {
		address = "https://" + address
	}
	u, err := url.Parse(address)
	if err != nil || u.Host == "" {
		return fmt.Errorf("%q is not a web address", address)
	}
	site := Site{URL: u.Scheme + "://" + u.Host, host: u.Host}
	name, _ := os.Hostname()

	var begin struct {
		DeviceCode      string `json:"deviceCode"`
		UserCode        string `json:"userCode"`
		VerificationURL string `json:"verificationUrl"`
		Interval        int    `json:"interval"`
		ExpiresIn       int    `json:"expiresIn"`
	}
	if _, err := call(site, http.MethodPost, "/api/auth/device", map[string]string{"name": name}, &begin); err != nil {
		return err
	}
	fmt.Printf("Code: %s\nOpen this page, sign in and allow access:\n  %s\n", begin.UserCode, begin.VerificationURL)
	openBrowser(begin.VerificationURL)

	deadline := time.Now().Add(time.Duration(begin.ExpiresIn) * time.Second)
	for time.Now().Before(deadline) {
		time.Sleep(time.Duration(max(begin.Interval, 1)) * time.Second)
		var granted struct {
			Token string `json:"token"`
		}
		code, err := call(site, http.MethodPost, "/api/auth/device/token", map[string]string{"deviceCode": begin.DeviceCode}, &granted)
		if code == http.StatusAccepted || code == http.StatusTooManyRequests {
			continue
		}
		if err != nil {
			return err
		}
		where := "the system keyring"
		if err := keyring.Set(keyringService, site.host, granted.Token); err != nil {
			site.Token = granted.Token
			where = store.path + " (no system keyring available)"
		}
		store.Hosts[site.host] = site
		store.Current = site.host
		if err := store.save(); err != nil {
			return err
		}
		fmt.Printf("Signed in to %s. The sign-in is kept in %s.\n", site.host, where)
		return nil
	}
	return errors.New("nobody allowed access in time")
}

func openBrowser(address string) {
	command, args := "xdg-open", []string{address}
	switch runtime.GOOS {
	case "darwin":
		command = "open"
	case "windows":
		command, args = "rundll32", []string{"url.dll,FileProtocolHandler", address}
	}
	_ = exec.Command(command, args...).Start() // #nosec G204 -- fixed program, address from the server the user chose
}

func logout(store *Store, site Site) error {
	if _, err := call(site, http.MethodDelete, "/api/auth/device/token", nil, nil); err != nil {
		fmt.Fprintln(os.Stderr, "wedwise: could not sign out on the server:", err)
	}
	_ = keyring.Delete(keyringService, site.host)
	delete(store.Hosts, site.host)
	if store.Current == site.host {
		store.Current = ""
		for host := range store.Hosts {
			store.Current = host
			break
		}
	}
	if err := store.save(); err != nil {
		return err
	}
	fmt.Printf("Signed out of %s.\n", site.host)
	return nil
}

func hosts(store *Store) error {
	if len(store.Hosts) == 0 {
		fmt.Println("Not signed in anywhere. Run: wedwise login <url>")
		return nil
	}
	names := make([]string, 0, len(store.Hosts))
	for host := range store.Hosts {
		names = append(names, host)
	}
	sort.Strings(names)
	for _, host := range names {
		mark := " "
		if host == store.Current {
			mark = "*"
		}
		fmt.Printf("%s %s  %s\n", mark, host, store.Hosts[host].URL)
	}
	return nil
}

type checkItem struct {
	Label string `json:"label"`
	Done  bool   `json:"done"`
}

// checklist reports which parts of the site are filled in.
func checklist(site Site) ([]checkItem, error) {
	var content struct {
		Names        []string `json:"names"`
		Date         string   `json:"date"`
		Introduction struct {
			Text string `json:"text"`
		} `json:"introduction"`
		Location struct {
			Name string `json:"name"`
		} `json:"location"`
		Travel struct {
			Lat   float64           `json:"lat"`
			Lng   float64           `json:"lng"`
			Stops []json.RawMessage `json:"stops"`
		} `json:"travel"`
		Accommodation struct {
			Hotels []json.RawMessage `json:"hotels"`
		} `json:"accommodation"`
		Schedule []json.RawMessage `json:"schedule"`
		FAQ      []json.RawMessage `json:"faq"`
		Privacy  string            `json:"privacy"`
	}
	if _, err := call(site, http.MethodGet, "/api/content/", nil, &content); err != nil {
		return nil, err
	}
	var links struct {
		Links []json.RawMessage `json:"links"`
	}
	if _, err := call(site, http.MethodGet, "/api/invite-links/", nil, &links); err != nil {
		return nil, err
	}
	// The public view also carries names and date set in the configuration.
	var public struct {
		Event struct {
			Couple []json.RawMessage `json:"couple"`
			Date   string            `json:"date"`
		} `json:"event"`
	}
	if _, err := call(site, http.MethodGet, "/api/content/public", nil, &public); err != nil {
		return nil, err
	}
	return []checkItem{
		{"Names and date", len(public.Event.Couple) > 0 && public.Event.Date != ""},
		{"Introduction", content.Introduction.Text != ""},
		{"Location name", content.Location.Name != ""},
		{"Location on the map", content.Travel.Lat != 0 || content.Travel.Lng != 0},
		{"Stops and car parks", len(content.Travel.Stops) > 0},
		{"Places to stay", len(content.Accommodation.Hotels) > 0},
		{"Schedule", len(content.Schedule) > 0},
		{"Questions and answers", len(content.FAQ) > 0},
		{"Privacy note", content.Privacy != ""},
		{"Invite link", len(links.Links) > 0},
	}, nil
}

func status(site Site) error {
	items, err := checklist(site)
	if err != nil {
		return err
	}
	fmt.Println(site.host)
	for _, item := range items {
		mark := "✗"
		if item.Done {
			mark = "✓"
		}
		fmt.Printf("  %s %s\n", mark, item.Label)
	}
	return nil
}

func exportContent(site Site, args []string) error {
	var data []byte
	if _, err := call(site, http.MethodGet, "/api/content/", nil, &data); err != nil {
		return err
	}
	var pretty bytes.Buffer
	if err := json.Indent(&pretty, data, "", "  "); err != nil {
		return err
	}
	pretty.WriteByte('\n')
	if len(args) == 0 {
		_, err := os.Stdout.Write(pretty.Bytes())
		return err
	}
	return os.WriteFile(args[0], pretty.Bytes(), 0o600)
}

func importContent(site Site, file string) error {
	data, err := os.ReadFile(file) // #nosec G304 -- the file the user named
	if err != nil {
		return err
	}
	var content map[string]any
	if err := json.Unmarshal(bytes.TrimPrefix(data, []byte("\xef\xbb\xbf")), &content); err != nil {
		return fmt.Errorf("%s: %w", file, err)
	}
	if _, err := call(site, http.MethodPut, "/api/content/", content, nil); err != nil {
		return err
	}
	fmt.Printf("Content of %s replaced.\n", site.host)
	return nil
}

func createInvite(site Site) error {
	var link struct {
		Token string `json:"token"`
	}
	if _, err := call(site, http.MethodPost, "/api/invite-links/", map[string]any{}, &link); err != nil {
		return err
	}
	fmt.Printf("%s/rsvp/%s\n", site.URL, link.Token)
	return nil
}
