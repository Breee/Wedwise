package server_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"testing"
)

func bearerDo(t *testing.T, app *testApp, method, path, token string, body any) *http.Response {
	t.Helper()
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, app.srv.URL+path, reader)
	if err != nil {
		t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func TestDeviceLogin(t *testing.T) {
	app, _ := newTestAppWithUsers(t)
	couple, _ := app.login("couple_user", "TestPass123!")
	witness, _ := app.login("witness_user", "TestPass123!")
	admin, _ := app.login("admin_user", "TestPass123!")

	var begun struct {
		DeviceCode, UserCode, VerificationURL string
	}
	resp := app.do(http.MethodPost, "/api/auth/device", map[string]string{"name": "laptop"}, nil)
	if err := json.NewDecoder(resp.Body).Decode(&begun); err != nil || begun.DeviceCode == "" || begun.UserCode == "" {
		t.Fatalf("begin: %v %+v", err, begun)
	}
	poll := map[string]string{"deviceCode": begun.DeviceCode}
	if resp := app.do(http.MethodPost, "/api/auth/device/token", poll, nil); resp.StatusCode != http.StatusAccepted {
		t.Fatalf("pending poll = %d", resp.StatusCode)
	}
	approve := map[string]string{"code": begun.UserCode}
	if resp := app.do(http.MethodPost, "/api/auth/device/approve", approve, nil); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous approve = %d", resp.StatusCode)
	}
	if resp := app.do(http.MethodPost, "/api/auth/device/approve", approve, couple); resp.StatusCode != http.StatusNoContent {
		t.Fatalf("approve = %d", resp.StatusCode)
	}
	if resp := app.do(http.MethodPost, "/api/auth/device/approve", approve, couple); resp.StatusCode != http.StatusNotFound {
		t.Fatalf("second approve = %d", resp.StatusCode)
	}
	var redeemed struct{ Token string }
	resp = app.do(http.MethodPost, "/api/auth/device/token", poll, nil)
	if err := json.NewDecoder(resp.Body).Decode(&redeemed); err != nil || redeemed.Token == "" {
		t.Fatalf("redeem: %v", err)
	}
	if resp := app.do(http.MethodPost, "/api/auth/device/token", poll, nil); resp.StatusCode != http.StatusNotFound {
		t.Fatalf("token handed out twice: %d", resp.StatusCode)
	}

	for path, want := range map[string]int{
		"/api/content/":       http.StatusOK,
		"/api/invite-links/":  http.StatusOK,
		"/api/responses/":     http.StatusOK,
		"/api/rsvp-summary":   http.StatusOK,
		"/api/contributions/": http.StatusForbidden,
		"/api/users/":         http.StatusForbidden,
		"/api/auth/sessions":  http.StatusUnauthorized,
	} {
		if resp := bearerDo(t, app, http.MethodGet, path, redeemed.Token, nil); resp.StatusCode != want {
			t.Errorf("GET %s with token = %d, want %d", path, resp.StatusCode, want)
		}
	}
	if resp := bearerDo(t, app, http.MethodPut, "/api/account/password", redeemed.Token,
		map[string]string{"current": "TestPass123!", "password": "AnotherPass123!"}); resp.StatusCode != http.StatusForbidden {
		t.Errorf("password change with token = %d", resp.StatusCode)
	}
	for user, paths := range map[*http.Cookie]map[string]int{
		witness: {"/api/contributions/": http.StatusOK, "/api/responses/": http.StatusOK, "/api/invite-links/": http.StatusForbidden, "/api/users/": http.StatusForbidden},
		admin:   {"/api/contributions/": http.StatusOK, "/api/responses/": http.StatusOK, "/api/invite-links/": http.StatusOK, "/api/users/": http.StatusOK},
	} {
		token := deviceToken(t, app, user)
		for path, want := range paths {
			if resp := bearerDo(t, app, http.MethodGet, path, token, nil); resp.StatusCode != want {
				t.Errorf("GET %s with role token = %d, want %d", path, resp.StatusCode, want)
			}
		}
	}
	// Even an admin's token cannot create accounts or change how anyone signs in.
	adminToken := deviceToken(t, app, admin)
	for _, call := range []struct {
		method, path string
		body         any
	}{
		{http.MethodPost, "/api/users/", map[string]string{"username": "intruder", "displayName": "Intruder", "role": "admin"}},
		{http.MethodPost, "/api/users/1/setup-link", nil},
		{http.MethodDelete, "/api/two-factor/1", nil},
	} {
		if resp := bearerDo(t, app, call.method, call.path, adminToken, call.body); resp.StatusCode != http.StatusForbidden {
			t.Errorf("%s %s with admin token = %d, want 403", call.method, call.path, resp.StatusCode)
		}
	}
	if resp := bearerDo(t, app, http.MethodGet, "/api/content/", "wrong", nil); resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("wrong token = %d", resp.StatusCode)
	}

	var listed struct {
		Devices []struct {
			ID   int64
			Name string
		}
	}
	resp = app.do(http.MethodGet, "/api/auth/devices", nil, couple)
	if err := json.NewDecoder(resp.Body).Decode(&listed); err != nil || len(listed.Devices) != 1 || listed.Devices[0].Name != "laptop" {
		t.Fatalf("devices: %v %+v", err, listed)
	}
	if resp := bearerDo(t, app, http.MethodDelete, "/api/auth/device/token", redeemed.Token, nil); resp.StatusCode != http.StatusNoContent {
		t.Fatalf("logout = %d", resp.StatusCode)
	}
	if resp := bearerDo(t, app, http.MethodGet, "/api/content/", redeemed.Token, nil); resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("revoked token = %d", resp.StatusCode)
	}
}

// deviceToken signs a command line client in as the given user.
func deviceToken(t *testing.T, app *testApp, user *http.Cookie) string {
	t.Helper()
	var begun struct{ DeviceCode, UserCode string }
	resp := app.do(http.MethodPost, "/api/auth/device", map[string]string{"name": "cli"}, nil)
	if err := json.NewDecoder(resp.Body).Decode(&begun); err != nil {
		t.Fatalf("begin: %v", err)
	}
	if resp := app.do(http.MethodPost, "/api/auth/device/approve", map[string]string{"code": begun.UserCode}, user); resp.StatusCode != http.StatusNoContent {
		t.Fatalf("approve = %d", resp.StatusCode)
	}
	var redeemed struct{ Token string }
	resp = app.do(http.MethodPost, "/api/auth/device/token", map[string]string{"deviceCode": begun.DeviceCode}, nil)
	if err := json.NewDecoder(resp.Body).Decode(&redeemed); err != nil || redeemed.Token == "" {
		t.Fatalf("redeem: %v", err)
	}
	return redeemed.Token
}
