// Apple devices get Apple's real system font (SF Pro). Everything else gets the bundled Inter, so Docket looks the same on Windows and Linux.
if (/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)) document.documentElement.classList.add('apple');
