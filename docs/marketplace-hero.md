# Homepage hero carousel

The hero at the top of the NIB Digital Solutions homepage is a full-width image carousel. Staff manage it in the staff portal under **Marketplace → Hero carousel** (`/hero-slides`). Changes reach the website on the next page load: no code change and no deployment.

## For administrators

### Slides

Each slide has:

| Field | Required | Notes |
|---|---|---|
| Wide image (desktop and tablet) | yes | 16:9, at least 1920 × 1080. **No text, captions, logos or product names in the image.** |
| Portrait image (phones) | no | 4:5, at least 1080 × 1350. See *Phones* below. |
| Title, description | no | Not shown on the homepage, which displays only its own headline ("Digital Solutions. Real Business Impact."). The title is announced to screen-reader users when the slide changes. Leave empty for an image-only slide. |
| Button text and link | no | Both or neither. Link: a page on this site (`/products`, `/products?category=lending-credit`, `#contact`) or a full `https://` address. |
| Image description | no | Read aloud by screen readers. Recommended. |
| Show on the website | — | Hidden slides stay in the list but are not shown. |

What you can do on the screen:

- **Add slide** opens the editor. Uploaded images are previewed and can be replaced (the portrait image can also be removed), and a preview shows the slide on large screens and on phones.
- **Change the order** by dragging a slide, or with the ↑ ↓ buttons (keyboard friendly). The order saves immediately.
- **Show or hide** a slide with its switch.
- **Edit** a slide with the pencil, or **delete** it with the bin.

If no slide is shown, the homepage displays the same headline beside a live product preview instead of the carousel.

**Composition:** on large screens the headline sits over the upper-left part of the image on a soft cream fade, so keep the main subject (presenter, product visuals) in the right ~60% of the frame and the left side calm. On tablets the headline comes first and the image is shown whole below it.

**Phones:** the headline comes first (two lines), then the picture, the slide controls under it, and an "Explore our products" button. Portrait images are used only when *every* shown slide has one, so the carousel's height never jumps between slides. Otherwise phones show each wide image as a 3:2 crop kept toward the right: about 14% is cut on the left and 2% on the right (nothing at the top or bottom), so keep faces and product cards out of the left edge. For a composition made for phones, upload a portrait image for every slide.

### Carousel settings

These are set in the panel next to the slides, and also under **Settings → Digital Solutions**:

| Setting | Default |
|---|---|
| Rotate automatically (off = visitors navigate manually) | on |
| Seconds per slide | 7 (3–30) |
| Transition duration | 700 ms (200–2000) |
| Pause while the pointer is over the carousel | on |
| Navigation controls: arrows and dots, dots only, or arrows only | arrows and dots |

Visitors can always swipe on touch screens. Automatic rotation also pauses on keyboard focus, when the carousel is scrolled out of view or the tab is in the background, and for visitors who prefer reduced motion. When it rotates, a pause button is shown.

### Image guidance

Use realistic photos of Ethiopian professionals presenting floating product interfaces, in NIB brown, gold, cream and white. Check that faces and hands look natural, and that the image contains **no text or logos**: put words in the slide's fields instead. Each slide should use a different image.

## How it works

| Part | Where |
|---|---|
| Table `hero_slides` (migration `add_hero_slides`) | `backend/prisma/schema.prisma` |
| Rules: image ids must be uploaded media, safe button links, button text and link together | `backend/src/modules/hero-slides/domain/hero-slide.entity.ts` |
| Staff API: CRUD (maker–checker capable), `GET /hero-slides/ordered`, `POST /hero-slides/reorder`, `GET/PATCH /hero-slides/settings` | `backend/src/modules/hero-slides/presentation/hero-slides.controller.ts` |
| Public API: `GET /marketplace/hero` (active slides in order and settings) | same file, `PublicHeroController` |
| Carousel settings (`marketplace.hero*` runtime settings) | `backend/src/modules/hero-slides/application/hero-settings.ts` |
| Admin screen | `frontend/src/features/hero-slides/` |
| Website carousel (server-loaded per request) | `frontend/src/features/marketplace/components/site/hero-showcase.tsx`, `api/hero.server.ts` |

- **Images** use the existing secure media store (`marketplace_media`):
  - The browser resizes each upload (desktop up to 2400 px wide, mobile up to 1200 px) and encodes it as WebP (JPEG on Safari) under 650 KB.
  - The server checks the real file type from the bytes, stores the image in PostgreSQL with a checksum, and serves it with immutable caching.
  - The website never sends the stored file as is: the Next.js image optimizer (`/_next/image`, configured in `frontend/next.config.ts`) resizes it to the width each screen needs and encodes it as AVIF or WebP (a 375 px phone gets about 17 KB instead of 195 KB). `features/marketplace/lib/responsive-image.ts` builds the `srcset`; product screenshots use it too.
  - Only the first slide's picture loads with the page: it is preloaded at high priority in the right size. The next slide's picture follows after the page has loaded; later ones as the visitor moves through the slides.
  - The optimizer needs sharp's native libraries in the server image. `outputFileTracingIncludes` in `next.config.ts` copies `node_modules/@img/**` into `.next/standalone`; without it, every image is silently served at full size.
  - Uploading needs `digital-products:update`, `hero-slides:create` or `hero-slides:update`.
- **Permissions:** `hero-slides:read`, `:create`, `:update` and `:delete`. Grant them to roles under *Roles & permissions*. Super admins have them already.
- **Audit:** every create, update, delete, reorder, settings change and upload is audited.
- **Maker–checker:** add `hero-slides.create,hero-slides.update,hero-slides.delete` to `APPROVAL_ACTIONS` to require a second approver for slide changes. Reordering and settings apply directly; they change presentation only and are audited.
- **Deleted media:** deleting a slide does not delete its image, because images are shared and de-duplicated.

## Setting it up on another environment

```bash
cd backend
npx prisma migrate deploy        # creates hero_slides
npm run cli -- permissions:sync  # adds the hero-slides permissions
```

Then restart the backend and frontend.
