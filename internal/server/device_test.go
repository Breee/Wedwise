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
	if resp := app.do(http.MethodPost, "/api/auth/device/approve", approve, witness); resp.StatusCode != http.StatusForbidden {
		t.Fatalf("witness approve = %d", resp.StatusCode)
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
		"/api/responses/":     http.StatusForbidden,
		"/api/rsvp-summary":   http.StatusForbidden,
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
