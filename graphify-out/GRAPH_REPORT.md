# Graph Report - zaka-e-hailing  (2026-10-06)

## Corpus Check
- 84 files · ~181,933 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 17 file(s) not represented in the graph (top: (none) 5, .rules 2, .plist 2)

## Summary
- 496 nodes · 1108 edges · 22 communities (19 shown, 3 thin omitted)
- Extraction: 97% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.82)
- Token cost: 294,546 input · 0 output

## Community Hubs (Navigation)
- Driver & Passenger Ride Screens
- Firestore Service & Admin
- Express Server & Payments
- App Shell & Auth UI
- Build Tooling & Dev Dependencies
- Auth Context & Profiles
- Glass Navigation Components
- iOS Native App Delegate
- Runtime Dependencies
- TypeScript Config
- Google Maps Components
- NPM Scripts
- Cyber Backdrop Artwork
- Splash Hero Artwork
- Welcome Background Artwork
- iOS Splash Placeholder A
- iOS Splash Placeholder B
- iOS App Icon Placeholder
- iOS Splash Placeholder C
- Vite Env Types
- Swift Package Manifest

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 35 edges
2. `react` - 31 edges
3. `lucide-react` - 25 edges
4. `LocationCoordinates` - 23 edges
5. `RideDocument` - 21 edges
6. `firestoreService` - 19 edges
7. `compilerOptions` - 16 edges
8. `UserRole` - 14 edges
9. `fareService` - 13 edges
10. `geocodingService` - 12 edges

## Surprising Connections (you probably didn't know these)
- `UserProfileModal()` --references--> `react`  [EXTRACTED]
  src/components/auth/UserProfileModal.tsx → package.json
- `DriverPendingScreen()` --references--> `react`  [EXTRACTED]
  src/components/driver/DriverPendingScreen.tsx → package.json
- `AuthProvider()` --references--> `react`  [EXTRACTED]
  src/context/AuthContext.tsx → package.json
- `AppContent()` --references--> `react`  [EXTRACTED]
  src/App.tsx → package.json
- `AuthModal()` --references--> `react`  [EXTRACTED]
  src/components/auth/AuthModal.tsx → package.json

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Backdrop Composition: Sedan + Africa Map + Route Trails Form the ZAKA Brand Visual** — src_assets_images_zaka_cyber_backdrop_1790488087552_luxury_black_sedan, src_assets_images_zaka_cyber_backdrop_1790488087552_dotted_africa_map, src_assets_images_zaka_cyber_backdrop_1790488087552_neon_route_light_trails, src_assets_images_zaka_cyber_backdrop_1790488087552_dark_amber_visual_theme [INFERRED 0.85]

## Communities (22 total, 3 thin omitted)

### Community 0 - "Driver & Passenger Ride Screens"
Cohesion: 0.07
Nodes (46): InteractiveMapProps, DriverActiveRideScreen(), DriverActiveRideScreenProps, IncomingRideCard(), IncomingRideCardProps, ActiveRidePanel(), ActiveRidePanelProps, DestinationSearchModal() (+38 more)

### Community 1 - "Firestore Service & Admin"
Cohesion: 0.06
Nodes (48): firebase_applet_config, firebase, AdminDashboard(), DriverApp(), DocUploadState, DriverPendingScreen(), REQUIRED_DOCS, UploadPhase (+40 more)

### Community 2 - "Express Server & Payments"
Cohesion: 0.05
Nodes (48): ref_crypto, ref_fs, ref_path, ACTIVE_RIDE_STATUSES, ADMIN_EMAILS, ADMIN_UIDS, app, calculatePeachSignature() (+40 more)

### Community 3 - "App Shell & Auth UI"
Cohesion: 0.08
Nodes (39): react, lucide-react, react, react-dom, App(), AppContent(), AuthModal(), AuthModalProps (+31 more)

### Community 4 - "Build Tooling & Dev Dependencies"
Cohesion: 0.04
Nodes (44): config, devDependencies, autoprefixer, @capacitor/cli, esbuild, tailwindcss, @types/express, @types/node (+36 more)

### Community 5 - "Auth Context & Profiles"
Cohesion: 0.11
Nodes (29): @capacitor/app, @capacitor-firebase/authentication, AVATAR_PRESETS, UserProfileModal(), UserProfileModalProps, ADMIN_EMAILS, ADMIN_UIDS, AuthContext (+21 more)

### Community 6 - "Glass Navigation Components"
Cohesion: 0.10
Nodes (25): motion, DEFAULT_PASSENGER_NAV_ITEMS, GlassNavItem, GlassSelectorNav(), GlassSelectorNavProps, InlineGlassSegmentedControlProps, NavTabId, DRIVER_PASSENGER_TAGS (+17 more)

### Community 7 - "iOS Native App Delegate"
Cohesion: 0.09
Nodes (20): Any, Bool, Capacitor, AppDelegate, UIScene, UISceneSession, UIWindow, SceneDelegate (+12 more)

### Community 8 - "Runtime Dependencies"
Cohesion: 0.08
Nodes (26): dependencies, canvas-confetti, @capacitor/app, @capacitor/browser, @capacitor/core, @capacitor-firebase/authentication, @capacitor/geolocation, @capacitor/haptics (+18 more)

### Community 9 - "TypeScript Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+9 more)

### Community 10 - "Google Maps Components"
Cohesion: 0.16
Nodes (11): @vis.gl/react-google-maps, Polyline, PolylineProps, PolylineRef, InteractiveMap(), GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_MAP_ID, INTERNAL_USAGE_ATTRIBUTION_ID (+3 more)

### Community 11 - "NPM Scripts"
Cohesion: 0.20
Nodes (10): scripts, build, build:rider-ios, build:web, cap:sync, clean, dev, lint (+2 more)

### Community 12 - "Cyber Backdrop Artwork"
Cohesion: 0.47
Nodes (6): ZAKA Cyber Backdrop (portrait hero background image), Dark Black-and-Amber Cyber Visual Theme, Dotted Halftone Map of Africa, Luxury Black Executive Sedan on Wet Asphalt, Orange Neon Route Light Trails, Premium African E-Hailing Brand Identity

### Community 13 - "Splash Hero Artwork"
Cohesion: 0.70
Nodes (5): ZAKA Splash Hero Image (black luxury sedan on coastal mountain road at sunset), South African Coastal Mountain Scenery (Cape Town style cliffs, ocean, winding road, fynbos), Black Mercedes-Benz Luxury Sedan (premium ride vehicle), Premium E-Hailing Brand Imagery (portrait splash/welcome hero, golden-hour sunset mood), Roadside Passenger Awaiting Pickup (motion-blurred figure by stone wall)

### Community 14 - "Welcome Background Artwork"
Cohesion: 0.60
Nodes (5): ZAKA Welcome Screen Background Image (luxury sedan overlooking city at sunset), Black Mercedes-Benz Luxury Sedan (hero vehicle, rear three-quarter view, tail lights lit), Cape Town-style Sunset Cityscape (flat-topped mountain, harbour, city lights, hilltop viewpoint), Mobile Portrait Full-Bleed Background Layout (9:16, subject centered, dark overlay-friendly zones), Premium E-Hailing Brand Mood (dark, warm orange-and-black palette, aspirational ride imagery)

### Community 15 - "iOS Splash Placeholder A"
Cohesion: 0.67
Nodes (4): iOS Splash Screen Image (2732x2732), Centered Blue Gradient Logo Mark, Default Capacitor Splash Placeholder, Universal Square Splash Layout

### Community 16 - "iOS Splash Placeholder B"
Cohesion: 0.67
Nodes (4): iOS Splash Screen Image (2732x2732, variant 1), Default Capacitor Logo Mark (blue gradient, centered), iOS Launch Splash Screen (white background, centered logo), Unbranded Placeholder Splash (no ZAKA branding applied)

### Community 17 - "iOS App Icon Placeholder"
Cohesion: 0.67
Nodes (3): iOS App Icon 1024x1024 (AppIcon-512@2x.png), Default Capacitor Logo Mark (blue gradient X of two offset diagonal arrows on white diamond grid), Placeholder App Branding (iOS icon not yet replaced with ZAKA brand artwork)

### Community 18 - "iOS Splash Placeholder C"
Cohesion: 1.00
Nodes (3): iOS Splash Screen Image (2732x2732, variant 2), Capacitor Default Logo Mark (blue gradient diagonal glyph), Unbranded Placeholder Splash Screen

## Ambiguous Edges - Review These
- `ZAKA Splash Hero Image (black luxury sedan on coastal mountain road at sunset)` → `Roadside Passenger Awaiting Pickup (motion-blurred figure by stone wall)`  [AMBIGUOUS]
  src/assets/images/zaka_splash_hero_1790475712295.jpg · relation: references
- `Black Mercedes-Benz Luxury Sedan (premium ride vehicle)` → `Roadside Passenger Awaiting Pickup (motion-blurred figure by stone wall)`  [AMBIGUOUS]
  src/assets/images/zaka_splash_hero_1790475712295.jpg · relation: conceptually_related_to

## Knowledge Gaps
- **162 isolated node(s):** `config`, `PackageDescription`, `name`, `private`, `version` (+157 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 209 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `ZAKA Splash Hero Image (black luxury sedan on coastal mountain road at sunset)` and `Roadside Passenger Awaiting Pickup (motion-blurred figure by stone wall)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Black Mercedes-Benz Luxury Sedan (premium ride vehicle)` and `Roadside Passenger Awaiting Pickup (motion-blurred figure by stone wall)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `firebase` connect `Firestore Service & Admin` to `Express Server & Payments`, `Build Tooling & Dev Dependencies`, `Auth Context & Profiles`?**
  _High betweenness centrality (0.156) - this node is a cross-community bridge._
- **Why does `react` connect `App Shell & Auth UI` to `Driver & Passenger Ride Screens`, `Firestore Service & Admin`, `Build Tooling & Dev Dependencies`, `Auth Context & Profiles`, `Glass Navigation Components`, `Google Maps Components`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Runtime Dependencies` to `App Shell & Auth UI`, `Build Tooling & Dev Dependencies`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **What connects `config`, `PackageDescription`, `name` to the rest of the system?**
  _162 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Driver & Passenger Ride Screens` be split into smaller, more focused modules?**
  _Cohesion score 0.0715962441314554 - nodes in this community are weakly interconnected._