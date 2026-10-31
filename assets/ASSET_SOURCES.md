# Asset sources

## OpisAI Horyzont wallpapers

`desktop-light.svg` and `desktop-dark.svg` were created directly in SVG for this project on 2026-10-23. They form the light and dark variants of **Horyzont**, an abstract landscape composed of wide, low layers, a quiet sky and directional light.

- Source: the editable SVG files in this repository, drawn from paths and gradients.
- No downloaded wallpaper, embedded bitmap, external image, font, filter or animation is used.
- Both variants share the same composition and are cropped with `background-size: cover`.
- The artwork contains no product logos or text.

Earlier versions used Windows 11 Bloom images from Microsoft's press gallery. Those image files and the outdated desktop preview have been removed from the current project tree. This change does not rewrite earlier Git commits.

## Interface and application icons

`icons.js` contains SVG drawings made for this demonstration. Monochrome interface glyphs use a consistent 20-unit coordinate system; caption glyphs use 10 units. The colored tools use project-specific drawings of generic functions: an application launcher, browser, folder, notes, settings and other desktop utilities. The earlier Windows, Edge, Microsoft Store and Word logo depictions have been removed. The OpisAI medical-bag icon represents this project's own application.

All SVGs are embedded locally by `Icons.svg(name, size, extraClass)`. No third-party icon font, remote image endpoint or tracking request is used.

## Klinika XP mock-up

`clinic.js` and `clinic.css` reconstruct the visit window of Klinika XP from the test mock `kxp_mock.c` 2.4.1 (OpisAI-resources), which was itself drawn after photos of the real program: the "Przebieg wizyty" main window, the separate description sub-window "Rejestracja wizyty: Wywiad - Badanie - Diagnoza", the read-only review and the visit list.

- Klinika XP is a product of BRI. The mock-up is an independent reconstruction for showing the OpisAI workflow, not a BRI product, and contains no artwork of the publisher.
- All patients, owners, visits and notes are fictional. Six catalog visits of the cat and the dog take their notes from the invented test cases 1–50 of `kxp_mock.c`, one case per visit; the mock's other cases and its start-up patient data are not used.
- Titles carry a `[DEMO]` prefix, as the mock's carry `[MOCK]`.

## Klinika XP mock-up icons

`clinic-icons.js` holds the 47 icons of the Klinika XP test mock `kxp_mock.c` 2.4.1 (OpisAI-resources). They were converted 1:1 to 32-unit SVG on 2026-10-31 by compiling the mock's shared `ui_icon()` drawing code with a painter that records rectangles, lines, ellipses and polygons instead of pixels.

- Source: the mock's own vector drawings of generic functions (calendar, clock, scales, thermometer, microphone, tubes, case bags…), not artwork of the Klinika XP publisher.
- No bitmap, photograph or external request is used. The patient photo slot shows the mock's "zdjęcie niedostępne" placeholder; the AI-generated photo embedded in `kxp_mock.c` is not used.

## Typography

The desktop prefers locally installed Segoe UI Variable / Segoe UI. Microsoft Selawik is bundled as a fallback for systems without Segoe UI. Microsoft describes Selawik as an open-source replacement for Segoe UI; its README also notes differences in kerning and hinting.

- Official repository: https://github.com/microsoft/Selawik
- Official release: https://github.com/microsoft/Selawik/releases/tag/1.01
- Release archive: https://github.com/microsoft/Selawik/releases/download/1.01/Selawik_Release.zip
- Release commit: `b65ff9ce7c4673e75ec5c622924a6b6f61f2f876`.
- License source: https://github.com/microsoft/Selawik/blob/b65ff9ce7c4673e75ec5c622924a6b6f61f2f876/LICENSE.txt
- License: SIL Open Font License 1.1; full copyright and license text are preserved in `fonts/LICENSE.txt`.
- Copyright: Microsoft Corporation, 2015. Selawik is the upstream reserved font name and a Microsoft trademark.
- Retrieved: 2026-10-23.

`fonts/selawik-regular.woff2` and `fonts/selawik-semibold.woff2` are byte-for-byte copies of the official release's `selawk.woff2` (weight 400) and `selawksb.woff2` (weight 600). Only the asset filenames were changed; the font data was not converted, subsetted, or otherwise modified. Both corresponding upstream TrueType fonts include Polish diacritics. These assets are served locally; no external font service is used.

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `fonts/selawik-regular.woff2` | 14,632 | `0f11afe1e85c8fd5d35d33e0142bd140e460a48cf3b42317d0c34e40c2b7118b` |
| `fonts/selawik-semibold.woff2` | 14,896 | `83767c05ef6b99e054a20e85ed538223c3d3147fd3bea8c372ca9c46764d8c5b` |
