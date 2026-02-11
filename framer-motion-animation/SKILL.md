---
name: writing-framer-motion-animations
description: Apply soft spring physics, opacity fading, and staggered delays when writing Framer Motion animations. Follows Apple/Shopify-grade design taste. Triggered when the user needs to create animations, adjust transitions, or build motion components.
---

# Framer Motion Animation Guidelines

> Core principle: **Springs for fluidity, opacity for breathing, stagger for rhythm, hover for instant feedback.**

## Design Philosophy — Apple & Shopify Grade Motion

Every animation must feel **intentional, restrained, and physically grounded**. Reference the motion language of Apple.com and Shopify Polaris:

### Purposeful Motion

- **Every animation must have a reason.** If removing an animation doesn't degrade UX clarity, remove it. Motion is not decoration — it communicates spatial relationships, state changes, and hierarchy.
- **Content leads, motion follows.** The user's eye should track content, not be distracted by the animation itself. When done right, the user *feels* the transition but doesn't consciously *notice* it.

### Physical Realism

- **Deceleration over linear.** Objects in the real world decelerate as they arrive. Never use `ease: 'linear'` for UI motion. Prefer spring physics or `ease: [0.25, 0.1, 0.25, 1.0]` (Apple's system curve) when springs aren't suitable.
- **Mass and weight.** Larger elements (hero images, full-screen panels) should feel heavier — use higher `mass` (1.2–1.5) and lower `stiffness` (80–120). Smaller elements (icons, badges, tooltips) should feel lighter — lower `mass` (0.6–0.8) and higher `stiffness` (180–220).
- **No teleportation.** Elements must always transition from one state to another. Never let an element appear/disappear without at least an opacity + scale transition.

### Restraint & Subtlety

- **Small values, big impact.** Prefer `scale: 1.02–1.05` over `1.1+`. Prefer `y: 8–20` offsets over `y: 100+`. Prefer `rotate: 1–3°` subtle tilts over dramatic spins in UI chrome.
- **Consistent timing rhythm.** Establish a timing scale and stick to it: `150ms` (micro), `300ms` (standard), `500ms` (emphasis), `800ms` (dramatic). Avoid arbitrary durations.
- **One motion per interaction.** A button hover should do ONE thing (e.g., scale up). Not scale + rotate + color shift + shadow change simultaneously. Layer effects only for hero/showcase moments.

### Spatial Hierarchy

- **Z-axis awareness.** Elements moving "toward" the user should scale up + add shadow. Elements moving "away" should scale down + reduce shadow. This creates depth without 3D transforms.
- **Directional consistency.** If a panel slides in from the right, it should slide out to the right (or dissolve). Never break the spatial mental model.
- **Stagger reveals the structure.** Staggered animations should follow the visual reading order (top-to-bottom, left-to-right in LTR layouts). This subtly teaches users the page hierarchy.

### Micro-interactions (Shopify Polaris Style)

- **Feedback within 100ms.** Hover, press, and focus states must respond within 100ms to feel connected to the user's input.
- **Elastic acknowledgment.** Use a subtle spring overshoot (damping: 12–15) on interactive elements (buttons, toggles, checkboxes) to give a tactile "click" feel.
- **State transitions over state swaps.** Never hard-swap between states (e.g., toggling a boolean class). Always interpolate: `opacity 0→1`, `height 0→auto`, `backgroundColor A→B`.

### What to Avoid

| Anti-pattern | Why it fails | Fix |
|-------------|-------------|-----|
| Bounce effects on page load | Feels cheap and unpolished | Use critically-damped springs (damping ≥ 20) |
| Parallax on everything | Overwhelming, causes motion sickness | Reserve for 1 hero section max |
| Delay > 1s before content appears | User thinks page is broken | Keep total stagger under 600ms |
| Spinning loaders lasting > 3s | Feels unresponsive | Show skeleton/placeholder instead |
| Animating layout properties (width, height) | Causes layout thrashing, 60fps drops | Animate `transform` and `opacity` only |
| Identical animation on every element | Monotonous, loses meaning | Vary timing/offset, keep motion vocabulary small |

## Instructions

### 1. Spring Physics

All translation and transform animations must use `type: 'spring'`. Never use raw `type: 'tween'` for positional movement.

| Scenario | stiffness | damping | mass | Effect |
|----------|-----------|---------|------|--------|
| Standard translation (x, y) | 120 | 20 | 1.2 | Soft with inertia, never abrupt |
| Scale / Rotation (scale, rotate) | 150 | 22 | 1.2 | Slightly tighter but not stiff |
| Exit animations | 150 | 25 | 1.2 | Smooth exit, no residual bounce |
| Hover interactions | 200 | 15 | 0.8 | Fast response with subtle elasticity |

**Rules:**
- `stiffness` must not exceed 250 — higher values feel mechanical and rigid
- `mass` ≥ 1.0 provides inertia feel; may drop to 0.8 for hover to ensure snappy response
- `damping` should stay within 15–25; too low causes excessive bounce, too high kills the spring feel

### 2. Opacity Fade

| Scenario | duration |
|----------|----------|
| Enter / Exit | **0.6s** |
| Hover interactions | **0.3s** |

**Rules:**
- Opacity must always be paired with `scale` transitions (`0.8 → 1`) to create spatial depth
- Never animate opacity alone for enter/exit — always combine with scale

### 3. Stagger Delay

For multi-element scenarios (lists, card groups, grids), always apply incremental delay based on `index`:

| Scenario | Delay interval |
|----------|---------------|
| Cards / List groups | `index * 0.15s` |
| Fast interaction contexts | `index * 0.08s` |

**Rules:**
- All properties on the same element (x, y, opacity, scale, rotate) must use the same delay value to maintain rhythmic consistency
- Never use different delays across properties — this causes de-synchronized animations

### 4. Enter / Exit Pattern

Use `AnimatePresence` with `custom` prop to pass directional values:

**Rules:**
- `enter` state: slide in from far (`x: ±1000`) + shrink (`scale: 0.8`) + rotate (`rotate: ±20`) + transparent (`opacity: 0`)
- `center` state: target position + `scale: 1` + target rotation + `opacity: 1`
- `exit` state: slide out in the opposite direction — mirror of enter parameters
- Set `initial={false}` to prevent entrance animation on first render (when appropriate)

### 5. Hover State

**Rules:**
- Reset `rotate` to `0` to remove tilt and create a focused appearance
- Use `scale: 1.05` for subtle enlargement — never exceed `1.1`
- Elevate `zIndex` to highest layer (100), and `transition.zIndex.duration` must be `0` to prevent visual flickering
- Apply `setTimeout` debounce (50ms) to prevent jitter from rapid mouse sweeps

### 6. Performance Optimization

**Mandatory:**
- Add `style={{ willChange: 'transform' }}` to animated elements for GPU acceleration hints
- Set `transformOrigin: 'center center'` to ensure consistent scale/rotation origin
- Auto-rotating / looping animations must use `IntersectionObserver` to pause when off-screen
- All `setInterval` / `setTimeout` must be cleaned up on component unmount

## Examples

### Full Card Enter/Exit Animation

```tsx
import { AnimatePresence, motion } from 'framer-motion'

const cardVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 1000 : -1000,
    opacity: 0,
    scale: 0.8,
    rotate: dir > 0 ? 20 : -20,
  }),
  center: {
    x: 0,
    y: 0,
    opacity: 1,
    scale: 1,
    rotate: 0,
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -1000 : 1000,
    opacity: 0,
    scale: 0.8,
    rotate: dir > 0 ? -20 : 20,
  }),
}

<AnimatePresence initial={false} custom={direction}>
  {items.map((item, index) => (
    <motion.div
      key={item.id}
      custom={direction}
      variants={cardVariants}
      initial="enter"
      animate={{
        ...cardVariants.center,
        transition: {
          x:       { type: 'spring', stiffness: 120, damping: 20, mass: 1.2, delay: index * 0.15 },
          y:       { type: 'spring', stiffness: 120, damping: 20, mass: 1.2, delay: index * 0.15 },
          opacity: { duration: 0.6, delay: index * 0.15 },
          scale:   { type: 'spring', stiffness: 150, damping: 22, mass: 1.2, delay: index * 0.15 },
          rotate:  { type: 'spring', stiffness: 150, damping: 22, mass: 1.2, delay: index * 0.15 },
          zIndex:  { duration: 0 },
        },
      }}
      exit={{
        ...cardVariants.exit(direction),
        transition: {
          x:       { type: 'spring', stiffness: 150, damping: 25, mass: 1.2 },
          y:       { type: 'spring', stiffness: 150, damping: 25, mass: 1.2 },
          opacity: { duration: 0.6 },
          scale:   { type: 'spring', stiffness: 180, damping: 24, mass: 1.2 },
          rotate:  { type: 'spring', stiffness: 180, damping: 24, mass: 1.2 },
          zIndex:  { duration: 0 },
        },
      }}
      style={{ willChange: 'transform', transformOrigin: 'center center' }}
    />
  ))}
</AnimatePresence>
```

### Hover Interaction

```tsx
const [isHovered, setIsHovered] = useState(false)
const hoverTimeoutRef = useRef<number | null>(null)

const handleHoverStart = () => {
  if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
  hoverTimeoutRef.current = setTimeout(() => setIsHovered(true), 50) as unknown as number
}
const handleHoverEnd = () => {
  if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
  setIsHovered(false)
}

<motion.div
  onHoverStart={handleHoverStart}
  onHoverEnd={handleHoverEnd}
  animate={isHovered ? {
    rotate: 0,
    scale: 1.05,
    zIndex: 100,
    transition: {
      scale:   { type: 'spring', stiffness: 200, damping: 15, mass: 0.8 },
      rotate:  { type: 'spring', stiffness: 200, damping: 15, mass: 0.8 },
      opacity: { duration: 0.3 },
      zIndex:  { duration: 0 },
    },
  } : normalState}
/>
```

### Viewport Visibility Control

```tsx
const containerRef = useRef<HTMLDivElement>(null)
const [isVisible, setIsVisible] = useState(false)

useEffect(() => {
  const el = containerRef.current
  if (!el) return
  const observer = new IntersectionObserver(
    ([entry]) => setIsVisible(entry.isIntersecting),
    { threshold: 0.1 }
  )
  observer.observe(el)
  return () => observer.disconnect()
}, [])

useEffect(() => {
  if (!isVisible || isPaused) return
  const interval = setInterval(() => { /* auto-rotate logic */ }, 3000)
  return () => clearInterval(interval)
}, [isVisible, isPaused])
```

### Quick Reference Presets

```tsx
const animationPresets = {
  enter: {
    x:       { type: 'spring', stiffness: 120, damping: 20, mass: 1.2 },
    y:       { type: 'spring', stiffness: 120, damping: 20, mass: 1.2 },
    opacity: { duration: 0.6 },
    scale:   { type: 'spring', stiffness: 150, damping: 22, mass: 1.2 },
    rotate:  { type: 'spring', stiffness: 150, damping: 22, mass: 1.2 },
  },
  exit: {
    x:       { type: 'spring', stiffness: 150, damping: 25, mass: 1.2 },
    y:       { type: 'spring', stiffness: 150, damping: 25, mass: 1.2 },
    opacity: { duration: 0.6 },
    scale:   { type: 'spring', stiffness: 180, damping: 24, mass: 1.2 },
    rotate:  { type: 'spring', stiffness: 180, damping: 24, mass: 1.2 },
  },
  hover: {
    scale:   { type: 'spring', stiffness: 200, damping: 15, mass: 0.8 },
    rotate:  { type: 'spring', stiffness: 200, damping: 15, mass: 0.8 },
    opacity: { duration: 0.3 },
    zIndex:  { duration: 0 },
  },
  stagger: (index: number) => index * 0.15,
}
```

## Checklist

### Design Taste

- [ ] Can the animation be removed without losing clarity? If yes, remove it
- [ ] Motion feels physically grounded — deceleration, not linear
- [ ] Larger elements feel heavier, smaller elements feel lighter
- [ ] Scale values ≤ 1.05 for UI chrome (hero sections may go to 1.1)
- [ ] Only `transform` and `opacity` are animated — no layout properties
- [ ] Total stagger duration stays under 600ms
- [ ] One primary motion per interaction (no over-layered effects)
- [ ] Spatial direction is consistent (in/out follow the same axis)
- [ ] Interactive feedback responds within 100ms

### Technical

- [ ] Spring parameters within recommended range (stiffness ≤ 250)
- [ ] Opacity transitions paired with scale changes
- [ ] List elements include staggered delays
- [ ] All properties on the same element share identical delay values
- [ ] Hover `zIndex` transition set to `duration: 0`
- [ ] `willChange: 'transform'` applied to animated elements
- [ ] Off-screen animations paused via IntersectionObserver
- [ ] All timers cleaned up on component unmount
