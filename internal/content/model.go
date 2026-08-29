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

// Content is the complete editable website content.
type Content struct {
	Hero         Hero            `json:"hero"`
	Introduction Introduction    `json:"introduction"`
	Location     Location        `json:"location"`
	Schedule     []ScheduleEntry `json:"schedule"`
	FAQ          []FAQEntry      `json:"faq"`
	UpdatedAt    time.Time       `json:"updatedAt"`
}
