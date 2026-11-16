// Package demo fills a development database with made-up responses.
package demo

import (
	"context"
	"fmt"
	"strings"

	"github.com/Breee/Wedwise/internal/contributions"
	"github.com/Breee/Wedwise/internal/invites"
	"github.com/Breee/Wedwise/internal/rsvp"
)

type guest struct {
	contact   string
	people    []rsvp.AttendeeInput
	genres    []string
	song      string
	message   string
	offer     *contributions.Input
	status    string
	slot      string
	minutes   int
	declining bool
}

func adult(name, diet, allergies string) rsvp.AttendeeInput {
	return rsvp.AttendeeInput{Name: name, PhotoOK: true, Diet: diet, Allergies: allergies}
}

func child(name string, age int, diet, allergies string) rsvp.AttendeeInput {
	return rsvp.AttendeeInput{Name: name, IsChild: true, Age: age, Diet: diet, Allergies: allergies}
}

func offer(title, description, needs, kind, handle string) *contributions.Input {
	return &contributions.Input{
		Title: title, Description: description, Needs: needs,
		Messengers: []contributions.Messenger{{Kind: kind, Handle: handle}},
	}
}

var guests = []guest{
	{contact: "Familie Sommer", people: []rsvp.AttendeeInput{adult("Anna Sommer", "vegetarian", ""), adult("Lukas Sommer", "none", "Nüsse"), child("Mia Sommer", 6, "none", ""), child("Ben Sommer", 3, "none", "Laktose")}, genres: []string{"Pop", "90er", "Disco"}, song: "ABBA – Dancing Queen", message: "Wir freuen uns riesig auf euch!"},
	{contact: "Jonas Keller", people: []rsvp.AttendeeInput{adult("Jonas Keller", "none", ""), adult("Lea Brandt", "vegan", "")}, genres: []string{"Rock", "Metal", "Punk"}, song: "Metallica – Enter Sandman", offer: offer("Rede des Trauzeugen", "Ein paar Geschichten aus der Studienzeit.", "Mikrofon", "signal", "jonas.keller"), status: "confirmed", slot: "20:00", minutes: 10},
	{contact: "Oma Hilde", people: []rsvp.AttendeeInput{adult("Hildegard Maier", "none", "Gluten")}, genres: []string{"Schlager", "Jazz / Swing"}, song: "Udo Jürgens – Griechischer Wein", message: "Ich bringe meinen Tanzpartner leider nicht mit."},
	{contact: "Familie Yilmaz", people: []rsvp.AttendeeInput{adult("Emre Yilmaz", "none", ""), adult("Selin Yilmaz", "vegetarian", ""), child("Deniz Yilmaz", 9, "vegetarian", "")}, genres: []string{"Hip-Hop", "R&B", "Latin"}, song: "Outkast – Hey Ya!"},
	{contact: "Clara und Tom", people: []rsvp.AttendeeInput{adult("Clara Vogel", "vegan", "Soja"), adult("Tom Richter", "none", "")}, genres: []string{"Indie", "Electro Swing", "House / Electro"}, song: "Parov Stelar – Booty Swing", offer: offer("Fotoshow", "Bilder aus zehn Jahren, etwa acht Minuten.", "Beamer / Leinwand, Laptop-Anschluss (HDMI)", "whatsapp", "+49 170 5550101"), status: "planning", slot: "20:10", minutes: 10},
	{contact: "Felix Baumann", people: []rsvp.AttendeeInput{adult("Felix Baumann", "none", "")}, genres: []string{"Techno", "Drum & Bass", "House / Electro"}, song: "Daft Punk – One More Time"},
	{contact: "Familie Nowak", people: []rsvp.AttendeeInput{adult("Marta Nowak", "none", ""), adult("Piotr Nowak", "none", "Fisch"), child("Zofia Nowak", 12, "none", "")}, genres: []string{"Pop", "Charts", "2000er"}, song: "Beyoncé – Crazy in Love"},
	{contact: "Sophie Lang", people: []rsvp.AttendeeInput{adult("Sophie Lang", "vegetarian", ""), adult("Marie Lang", "vegetarian", "")}, genres: []string{"Soul / Funk", "Disco", "80er"}, song: "Earth, Wind & Fire – September", offer: offer("Lied für das Brautpaar", "Zwei Stimmen und eine Gitarre.", "Mikrofon, Musikanlage", "telegram", "sophielang"), status: "new"},
	{contact: "Onkel Dieter", people: []rsvp.AttendeeInput{adult("Dieter Maier", "none", ""), adult("Renate Maier", "none", "Laktose")}, genres: []string{"Schlager", "80er"}, song: "Nena – 99 Luftballons", message: "Wir reisen schon am Donnerstag an."},
	{contact: "Nina Hofmann", people: []rsvp.AttendeeInput{adult("Nina Hofmann", "other", "kein Schweinefleisch")}, genres: []string{"Reggae", "Latin", "Hip-Hop"}, song: "Bob Marley – Could You Be Loved"},
	{contact: "Familie Schneider", people: []rsvp.AttendeeInput{adult("Katrin Schneider", "none", ""), adult("Uwe Schneider", "none", ""), child("Paul Schneider", 15, "none", "Erdnüsse"), child("Emma Schneider", 11, "vegetarian", "")}, genres: []string{"Rock", "90er", "Charts"}, song: "Queen – Don't Stop Me Now"},
	{contact: "Max Winter", people: []rsvp.AttendeeInput{adult("Max Winter", "none", ""), adult("Julia Winter", "none", "")}, genres: []string{"Hardcore", "Metal", "Punk"}, song: "Rise Against – Savior", offer: offer("Hochzeitsspiel", "Das Brautpaar-Quiz mit Schildern.", "Platz zum Aufbauen, Sonstiges: zwei Stühle", "signal", "+49 171 5550102"), status: "needs_clarification"},
	{contact: "Tante Gisela", people: []rsvp.AttendeeInput{adult("Gisela Franke", "vegetarian", "")}, genres: []string{"Jazz / Swing", "Soul / Funk"}, song: "Frank Sinatra – Fly Me to the Moon"},
	{contact: "Ole und Finn", people: []rsvp.AttendeeInput{adult("Ole Petersen", "vegan", ""), adult("Finn Petersen", "none", "Sellerie")}, genres: []string{"Indie", "Pop", "2000er"}, song: "The Killers – Mr. Brightside"},
	{contact: "Familie Rossi", people: []rsvp.AttendeeInput{adult("Giulia Rossi", "none", ""), adult("Marco Rossi", "none", ""), child("Luca Rossi", 1, "none", "")}, genres: []string{"Latin", "Disco", "Pop"}, song: "Gipsy Kings – Bamboléo", message: "Wir bräuchten einen Hochstuhl."},
	{contact: "Hannah Krüger", people: []rsvp.AttendeeInput{adult("Hannah Krüger", "vegetarian", "Gluten")}, genres: []string{"Electro Swing", "Jazz / Swing", "Indie"}, song: "Caravan Palace – Lone Digger"},
	{contact: "Stefan Wolf", people: []rsvp.AttendeeInput{adult("Stefan Wolf", "none", ""), adult("Petra Wolf", "none", "")}, genres: []string{"80er", "Rock", "Schlager"}, song: "Bon Jovi – Livin' on a Prayer"},
	{contact: "Die WG", people: []rsvp.AttendeeInput{adult("Paula Stein", "vegan", ""), adult("Karim Haddad", "none", ""), adult("Ida Lorenz", "vegetarian", "Nüsse")}, genres: []string{"Techno", "Hip-Hop", "Drum & Bass"}, song: "Peter Fox – Alles neu", offer: offer("Überraschungstanz", "Kurze Choreografie, etwa fünf Minuten.", "Musikanlage, Platz zum Aufbauen", "whatsapp", "+49 172 5550103"), status: "confirmed", slot: "20:20", minutes: 5},
	{contact: "Opa Karl", people: []rsvp.AttendeeInput{adult("Karl Maier", "none", "")}, genres: []string{"Schlager"}, message: "Bitte einen Platz nah am Ausgang."},
	{contact: "Laura Engel", people: []rsvp.AttendeeInput{adult("Laura Engel", "none", ""), adult("David Engel", "none", "Laktose")}, genres: []string{"Charts", "R&B", "2000er"}, song: "Rihanna – We Found Love"},
	{contact: "Familie Becker", people: []rsvp.AttendeeInput{adult("Sabine Becker", "none", ""), child("Noah Becker", 8, "none", "")}, genres: []string{"Pop", "90er"}, song: "Backstreet Boys – Everybody"},
	{contact: "Tim Schubert", people: []rsvp.AttendeeInput{adult("Tim Schubert", "vegetarian", "")}, genres: []string{"Metal", "Rock"}, song: "AC/DC – Thunderstruck"},
	{contact: "Mira und Jan", people: []rsvp.AttendeeInput{adult("Mira Scholz", "vegan", ""), adult("Jan Scholz", "vegan", "")}, genres: []string{"House / Electro", "Disco", "Electro Swing"}, song: "Purple Disco Machine – Hypnotized"},
	{contact: "Carla Jung", people: []rsvp.AttendeeInput{adult("Carla Jung", "none", "Erdbeeren")}, genres: []string{"Soul / Funk", "R&B"}, song: "Stevie Wonder – Superstition"},
	{contact: "Robert Haas", declining: true, message: "Leider sind wir an dem Wochenende im Urlaub. Feiert schön!"},
	{contact: "Familie Lindner", declining: true, message: "Wir schaffen es leider nicht."},
	{contact: "Vera Seidel", declining: true},
	{contact: "Moritz Graf", declining: true, message: "Ich bin beruflich im Ausland, denke an euch."},
	{contact: "Elke Busch", declining: true},
	{contact: "Kai Thomsen", declining: true, message: "Schade, das überschneidet sich mit einer anderen Hochzeit."},
}

// Seed writes the made-up responses once. A second call adds nothing.
func Seed(ctx context.Context, links *invites.Store, responses *rsvp.Store, offers *contributions.Store) (int, error) {
	existing, err := responses.List(ctx)
	if err != nil {
		return 0, err
	}
	for _, r := range existing {
		if r.ContactName == guests[0].contact {
			return 0, nil
		}
	}

	all, err := links.List(ctx)
	if err != nil {
		return 0, err
	}
	var link invites.Link
	if len(all) > 0 {
		link = all[0]
	} else if link, err = links.Create(ctx); err != nil {
		return 0, err
	}

	planned := map[int64]guest{}
	for _, g := range guests {
		params := rsvp.SubmitParams{
			ContactName: g.contact, Status: "yes", Message: g.message,
			MusicGenres: strings.Join(g.genres, ", "), MusicSong: g.song,
			Attendees: g.people, Contribution: g.offer,
		}
		if g.declining {
			params.Status = "no"
		}
		response, _, err := responses.Create(ctx, link.ID, params)
		if err != nil {
			return 0, fmt.Errorf("%s: %w", g.contact, err)
		}
		if g.offer != nil {
			planned[response.ID] = g
		}
	}

	list, err := offers.List(ctx, "")
	if err != nil {
		return 0, err
	}
	for _, c := range list {
		g, ok := planned[c.ResponseID]
		if !ok {
			continue
		}
		if g.status != "" && g.status != "new" {
			if _, err := offers.SetStatus(ctx, c.ID, g.status); err != nil {
				return 0, err
			}
		}
		if g.slot != "" {
			if _, err := offers.SetSchedule(ctx, c.ID, g.slot, g.minutes); err != nil {
				return 0, err
			}
		}
	}
	return len(guests), nil
}
