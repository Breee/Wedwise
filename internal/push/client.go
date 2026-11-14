package push

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"syscall"
	"time"
)

var errPrivateAddress = errors.New("push endpoint resolves to a non-public address")

// carrierGradeNAT is shared address space, which IsPrivate does not cover.
var carrierGradeNAT = netip.MustParsePrefix("100.64.0.0/10")

func publicAddress(addr netip.Addr) bool {
	addr = addr.Unmap()
	return addr.IsValid() && addr.IsGlobalUnicast() && !addr.IsPrivate() &&
		!addr.IsLoopback() && !addr.IsLinkLocalUnicast() && !carrierGradeNAT.Contains(addr)
}

// publicOnly runs after name resolution, right before the connection is made,
// so a host name cannot point the server at an internal address.
func publicOnly(_, address string, _ syscall.RawConn) error {
	addrPort, err := netip.ParseAddrPort(address)
	if err != nil {
		return fmt.Errorf("%w: %v", errPrivateAddress, err)
	}
	if !publicAddress(addrPort.Addr()) {
		return errPrivateAddress
	}
	return nil
}

// newClient returns the HTTP client used for push deliveries. It only
// connects to public addresses, ignores proxy settings and never follows
// redirects.
func newClient() *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second, Control: publicOnly}
	return &http.Client{
		Timeout: 20 * time.Second,
		Transport: &http.Transport{
			DialContext:           dialer.DialContext,
			TLSHandshakeTimeout:   10 * time.Second,
			ResponseHeaderTimeout: 15 * time.Second,
			MaxIdleConns:          10,
			IdleConnTimeout:       60 * time.Second,
		},
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}
