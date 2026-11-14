// Package content stores the editable text content of the public website.
package content

import "time"

// Hero is the hero section of the landing page.
type Hero struct {
	Eyebrow  string `json:"eyebrow"`
	Headline string `json:"headline"`
	Subtitle string `json:"subtitle"`
	Note     string `json:"note"`
}

// Introduction is the welcome text.
type Introduction struct {
	Text string `json:"text"`
}

// Location describes the venue.
type Location struct {
	Name          string `json:"name"`
	Address       string `json:"address"`
	Description   string `json:"description"`
	NavigationURL string `json:"navigationUrl"`
	Transport     string `json:"transport"`
	Parking       string `json:"parking"`
	Bike          string `json:"bike"`
	Image         string `json:"image"` // URL of a venue photo
}

// ScheduleEntry is one item of the wedding day schedule.
type ScheduleEntry struct {
	ID          int64  `json:"id"`
	Time        string `json:"time"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Order       int    `json:"order"`
}

// FAQEntry is one question and answer pair.
type FAQEntry struct {
	ID       int64  `json:"id"`
	Question string `json:"question"`
	Answer   string `json:"answer"`
	Order    int    `json:"order"`
}

// Stop is a public transport stop or parking spot near the venue.
type Stop struct {
	Name string  `json:"name"`
	Kind string  `json:"kind"` // tram, train, bus, parking
	Line string  `json:"line"`
	Lat  float64 `json:"lat"`
	Lng  float64 `json:"lng"`
}

// Travel holds the venue coordinates and the stops shown on the arrival map.
type Travel struct {
	Lat   float64 `json:"lat"`
	Lng   float64 `json:"lng"`
	Stops []Stop  `json:"stops"`
}

// Hotel is one recommended place to stay.
type Hotel struct {
	Name       string  `json:"name"`
	Area       string  `json:"area"`
	Kind       string  `json:"kind"` // hotel (default) or apartment
	Lat        float64 `json:"lat"`
	Lng        float64 `json:"lng"`
	PriceTier  int     `json:"priceTier"` // 1..3
	Note       string  `json:"note"`
	URL        string  `json:"url"`
	BookingURL string  `json:"bookingUrl"` // property page on a booking portal; dates are appended
}

// Accommodation is the stay section: dates for booking links plus hotels.
type Accommodation struct {
	CheckIn  string  `json:"checkIn"`  // YYYY-MM-DD
	CheckOut string  `json:"checkOut"` // YYYY-MM-DD
	Hotels   []Hotel `json:"hotels"`
}

// Content is the complete editable website content.
type Content struct {
	Hero          Hero            `json:"hero"`
	Introduction  Introduction    `json:"introduction"`
	Location      Location        `json:"location"`
	Travel        Travel          `json:"travel"`
	Accommodation Accommodation   `json:"accommodation"`
	Schedule      []ScheduleEntry `json:"schedule"`
	FAQ           []FAQEntry      `json:"faq"`
	Theme         string          `json:"theme"`   // name of the active theme preset
	Privacy       string          `json:"privacy"` // optional privacy note shown in the footer
	UpdatedAt     time.Time       `json:"updatedAt"`
}
