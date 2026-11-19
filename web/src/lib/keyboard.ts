// Keeps the field being typed in visible above the on-screen keyboard.
// The browser's own handling is unreliable (installed app, sticky bars), so once the
// keyboard is open the field is moved, in one step, just below the top bars.
const TOP = 84

function place(field: HTMLElement) {
  const view = window.visualViewport
  const height = view ? view.height : window.innerHeight
  const box = field.getBoundingClientRect()
  const wantsTop = field.dataset.keyboard === 'top'
  const visible = box.top >= TOP - 4 && box.bottom <= height - 12
  if (visible && !(wantsTop && box.top > TOP + 24)) return
  const target = wantsTop ? TOP : Math.min(TOP + 40, Math.max(TOP, height * 0.25))
  window.scrollBy({ top: box.top - target, behavior: 'auto' })
}

export function watchKeyboard() {
  if (!window.matchMedia('(pointer: coarse)').matches) return
  document.addEventListener('focusin', (event) => {
    const field = event.target as HTMLElement | null
    if (!field || !field.matches('input:not([type=checkbox]):not([type=radio]), textarea')) return
    // Room below the page, so fields near its end can still move above the keyboard.
    document.documentElement.classList.add('wed-typing')
    const view = window.visualViewport
    let done = false
    const once = () => {
      if (done || document.activeElement !== field) return
      done = true
      view?.removeEventListener('resize', once)
      place(field)
    }
    // The keyboard opening resizes the visual viewport; the timer covers browsers that do not report it.
    view?.addEventListener('resize', once)
    setTimeout(once, 450)
  })
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      const active = document.activeElement
      if (!active || !active.matches('input, textarea')) document.documentElement.classList.remove('wed-typing')
    }, 150)
  })
}
