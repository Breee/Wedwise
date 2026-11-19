package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
)

const mcpVersion = "2025-06-18"

type mcpTool struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
	// needs is the permission the signed-in account must have; empty = any.
	needs string
	run   func(site Site, args map[string]any) (any, error)
}

// read is a tool that returns what a GET on path answers.
func read(name, description, needs, path string) mcpTool {
	return mcpTool{
		Name: name, Description: description, InputSchema: schema(nil, map[string]any{}), needs: needs,
		run: func(site Site, _ map[string]any) (any, error) {
			var out any
			_, err := call(site, http.MethodGet, path, nil, &out)
			return out, err
		},
	}
}

func schema(required []string, properties map[string]any) map[string]any {
	s := map[string]any{"type": "object", "properties": properties}
	if len(required) > 0 {
		s["required"] = required
	}
	return s
}

func point(args map[string]any) (string, error) {
	lat, okLat := args["lat"].(float64)
	lng, okLng := args["lng"].(float64)
	if !okLat || !okLng {
		return "", fmt.Errorf("lat and lng are required numbers")
	}
	return fmt.Sprintf("%g,%g", lng, lat), nil
}

var number = map[string]any{"type": "number"}

// mcpTools is everything an agent may do. Each tool is offered only when the
// role of the signed-in account allows it.
var mcpTools = []mcpTool{
	read("whoami", "Show the signed-in account, its role and what it may do.", "", "/api/auth/me"),
	read("list_responses", "List the guests' responses with attendees, diets and allergies.", "rsvp.read", "/api/responses/"),
	read("response_summary", "Counts of responses, guests, children, diets and allergies.", "rsvp.read", "/api/rsvp-summary"),
	read("list_contributions", "List the programme contributions guests offered, with status and schedule.", "contribution.read", "/api/contributions/"),
	read("list_users", "List the staff accounts.", "user.read", "/api/users/"),
	{
		Name:        "setup_status",
		needs:       "content.read",
		Description: "List which parts of the wedding site are filled in and which are still missing.",
		InputSchema: schema(nil, map[string]any{}),
		run: func(site Site, _ map[string]any) (any, error) {
			return checklist(site)
		},
	},
	{
		Name:        "get_content",
		needs:       "content.read",
		Description: "Read all content of the site: names, date, texts, location, schedule, questions, map pins, places to stay, theme.",
		InputSchema: schema(nil, map[string]any{}),
		run: func(site Site, _ map[string]any) (any, error) {
			var content map[string]any
			_, err := call(site, http.MethodGet, "/api/content/", nil, &content)
			return content, err
		},
	},
	{
		Name:  "update_content",
		needs: "content.write",
		Description: "Change content. Pass only the top-level sections to replace, shaped as in get_content " +
			"(for example names, date, introduction, location, schedule, faq, travel, accommodation, privacy, theme). " +
			"A section given here replaces that whole section; sections left out stay as they are.",
		InputSchema: schema([]string{"content"}, map[string]any{"content": map[string]any{"type": "object"}}),
		run: func(site Site, args map[string]any) (any, error) {
			changes, ok := args["content"].(map[string]any)
			if !ok || len(changes) == 0 {
				return nil, fmt.Errorf("content must be an object with at least one section")
			}
			var content map[string]any
			if _, err := call(site, http.MethodGet, "/api/content/", nil, &content); err != nil {
				return nil, err
			}
			for key, value := range changes {
				content[key] = value
			}
			if _, err := call(site, http.MethodPut, "/api/content/", content, nil); err != nil {
				return nil, err
			}
			return checklist(site)
		},
	},
	{
		Name:        "list_themes",
		needs:       "content.read",
		Description: "List the designs the site can use. Set one with update_content {\"theme\": name}.",
		InputSchema: schema(nil, map[string]any{}),
		run: func(site Site, _ map[string]any) (any, error) {
			var themes struct {
				Themes []struct {
					Name  string `json:"name"`
					Label string `json:"label"`
				} `json:"themes"`
			}
			_, err := call(site, http.MethodGet, "/api/themes", nil, &themes)
			return themes.Themes, err
		},
	},
	{
		Name:        "search_place",
		needs:       "content.write",
		Description: "Find a place by name or address and get its coordinates. Give lat and lng of the location to prefer results nearby.",
		InputSchema: schema([]string{"query"}, map[string]any{"query": map[string]any{"type": "string"}, "lat": number, "lng": number}),
		run: func(site Site, args map[string]any) (any, error) {
			query, _ := args["query"].(string)
			path := "/api/places?q=" + url.QueryEscape(query)
			if near, err := point(args); err == nil {
				path += "&near=" + near
			}
			var places map[string]any
			_, err := call(site, http.MethodGet, path, nil, &places)
			return places["places"], err
		},
	},
	{
		Name:  "nearby",
		needs: "content.write",
		Description: "Suggest what is around a point, usually the location: kind \"stops\" for tram, bus and train stops and car parks, " +
			"kind \"stay\" for hotels and holiday flats. Ratings, prices and free rooms are not known.",
		InputSchema: schema([]string{"lat", "lng", "kind"}, map[string]any{
			"lat": number, "lng": number, "kind": map[string]any{"type": "string", "enum": []string{"stops", "stay"}},
		}),
		run: func(site Site, args map[string]any) (any, error) {
			at, err := point(args)
			if err != nil {
				return nil, err
			}
			path := "/api/places/nearby?at=" + at
			if args["kind"] == "stay" {
				path += "&kind=stay"
			}
			var places map[string]any
			_, err = call(site, http.MethodGet, path, nil, &places)
			return places["places"], err
		},
	},
	{
		Name:        "list_invite_links",
		needs:       "invite.manage",
		Description: "List the invite links guests use to answer, with their addresses.",
		InputSchema: schema(nil, map[string]any{}),
		run: func(site Site, _ map[string]any) (any, error) {
			var links struct {
				Links []map[string]any `json:"links"`
			}
			if _, err := call(site, http.MethodGet, "/api/invite-links/", nil, &links); err != nil {
				return nil, err
			}
			for _, link := range links.Links {
				if token, _ := link["token"].(string); token != "" {
					link["url"] = site.URL + "/rsvp/" + token
				}
				delete(link, "token")
			}
			return links.Links, nil
		},
	},
	{
		Name:        "create_invite_link",
		needs:       "invite.manage",
		Description: "Create a new invite link and return its address.",
		InputSchema: schema(nil, map[string]any{}),
		run: func(site Site, _ map[string]any) (any, error) {
			var link struct {
				Token string `json:"token"`
			}
			if _, err := call(site, http.MethodPost, "/api/invite-links/", map[string]any{}, &link); err != nil {
				return nil, err
			}
			return map[string]string{"url": site.URL + "/rsvp/" + link.Token}, nil
		},
	},
}

type mcpRequest struct {
	ID     json.RawMessage `json:"id"`
	Method string          `json:"method"`
	Params struct {
		Name      string         `json:"name"`
		Arguments map[string]any `json:"arguments"`
	} `json:"params"`
}

// serveMCP answers Model Context Protocol requests, one JSON message per line.
func serveMCP(site Site, in io.Reader, out io.Writer) error {
	lines := bufio.NewScanner(in)
	lines.Buffer(make([]byte, 0, 64<<10), 16<<20)
	encoder := json.NewEncoder(out)
	reply := func(id json.RawMessage, result any, failure map[string]any) error {
		message := map[string]any{"jsonrpc": "2.0", "id": id}
		if failure != nil {
			message["error"] = failure
		} else {
			message["result"] = result
		}
		return encoder.Encode(message)
	}
	var me account
	if _, err := call(site, http.MethodGet, "/api/auth/me", nil, &me); err != nil {
		return err
	}
	var tools []mcpTool
	for _, tool := range mcpTools {
		if tool.needs == "" || slices.Contains(me.Permissions, tool.needs) {
			tools = append(tools, tool)
		}
	}
	for lines.Scan() {
		if len(lines.Bytes()) == 0 {
			continue
		}
		var request mcpRequest
		if err := json.Unmarshal(lines.Bytes(), &request); err != nil {
			if err := reply(json.RawMessage("null"), nil, map[string]any{"code": -32700, "message": "parse error"}); err != nil {
				return err
			}
			continue
		}
		if request.ID == nil {
			continue // a notification needs no answer
		}
		var err error
		switch request.Method {
		case "initialize":
			err = reply(request.ID, map[string]any{
				"protocolVersion": mcpVersion,
				"capabilities":    map[string]any{"tools": map[string]any{}},
				"serverInfo":      map[string]any{"name": "wedwise", "version": "1"},
				"instructions": "Works on the wedding site " + site.host + " as " + me.Username + " (" + me.Role + "). " +
					"Only tools this role may use are listed.",
			}, nil)
		case "ping":
			err = reply(request.ID, map[string]any{}, nil)
		case "tools/list":
			err = reply(request.ID, map[string]any{"tools": tools}, nil)
		case "tools/call":
			err = reply(request.ID, callTool(site, tools, request.Params.Name, request.Params.Arguments), nil)
		default:
			err = reply(request.ID, nil, map[string]any{"code": -32601, "message": "method not found"})
		}
		if err != nil {
			return err
		}
	}
	return lines.Err()
}

func callTool(site Site, tools []mcpTool, name string, args map[string]any) map[string]any {
	answer := func(text string, failed bool) map[string]any {
		return map[string]any{"content": []map[string]string{{"type": "text", "text": text}}, "isError": failed}
	}
	for _, tool := range tools {
		if tool.Name != name {
			continue
		}
		result, err := tool.run(site, args)
		if err != nil {
			return answer(err.Error(), true)
		}
		text, err := json.MarshalIndent(result, "", "  ")
		if err != nil {
			return answer(err.Error(), true)
		}
		return answer(string(text), false)
	}
	return answer("unknown tool "+name, true)
}
