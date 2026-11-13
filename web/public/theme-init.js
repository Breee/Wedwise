try {
  var t = JSON.parse(localStorage.getItem('wedwise:theme-vars'))
  if (t && t.vars) {
    var r = document.documentElement
    for (var k in t.vars) r.style.setProperty(k, t.vars[k])
    r.dataset.decoration = t.decoration
    r.dataset.theme = t.theme
  }
} catch (e) {}
