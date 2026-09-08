# Playable Ads – Slide Game Specification

## 1. Technical Specifications

- **Format:** HTML5 Playable Ads
- **Compatibility:** iOS / Android
- **SDK Integration:** Facebook, Google Ads, Unity, AppLovin
- **Screen Size:** Responsive for both portrait and landscape orientations
- **Visual Mood:** Bright, colorful, and cheerful

---

## 2. Reference

**Reference Link:**

https://tpc.googlesyndication.com/sadbundle/$csp%3Der-p$/2379427671487872472/index.html

---

## 3. Playable Ads Content

The gameplay should closely follow the provided reference.

### Core Gameplay

- Customers stand in queues on both sides of the slide, waiting for their turn.
- Customers start from the waiting platform at the top.
- They slide down the slide.
- Passing through the arch at the end of the slide rewards the player with:
  - **+$5**
  - A money pop-up effect
- Each completed slide ride always earns **$5**.
- The starting scene contains one active slide and customers.

### UI

- **Money UI:** Top-right corner.
- **Play Now button:** Bottom-left corner.
  - Tapping the button immediately redirects the user to the store.

---

## 4. Upgrade System

There are three upgrade buttons.

**Button order from left to right:**

1. **Speed**
2. **Slide**
3. **Lv Up**

### 4.1 Speed Upgrade

- Increases customer sliding speed.
- Maximum upgrades: **10 times**
- Cost: **$20 per upgrade**
- Base slide duration: **4 seconds**
- Fully upgraded slide duration: approximately **1 second**
- Each upgrade reduces the time required to finish a slide by **15%**

#### Speed Upgrade VFX

When upgrading Speed:

- Display an appropriate VFX.
- Display a **Speed** text effect above the customers.
- Reference VFX:

https://dashboards-advertiser-assets-prd.storage.googleapis.com/assets/32c014ba84948c0f299b9aa6/ce48b795-bcb7-4224-a7f1-646fb46ad369.html

---

### 4.2 Slide Upgrade

- Increases the number of slide lanes.
- Maximum upgrades: **10 times**
- Cost: **$10 per upgrade**
- The number/layout of slide lanes should correspond to the current slide level.

#### Slide Upgrade VFX

- Play an appropriate appearance/build VFX when a new slide is added.

---

### 4.3 Lv Up Upgrade

- Upgrades the slide level.
- Maximum upgrades: **3 times**
- Cost: **$50 per upgrade**

#### Level Upgrade Behavior

Whenever the player upgrades the slide level:

- Reset all customers.
- All customers should restart sliding at the same time.

---

## 5. Upgrade Button States

### Insufficient Money

When the player does not have enough money:

- The price text on the corresponding upgrade button turns **red**.

### Maximum Upgrade

When an upgrade reaches its maximum level:

- The button becomes **gray**.
- The price text is replaced with **MAX**.

---

## 6. Idle Interaction Hint

If there is no user interaction for **5 seconds**:

- Display a pointer/hand indicator.
- The pointer should point at one currently available upgrade button.
- When the user taps an upgrade button, the pointer disappears.

---

## 7. Tutorial Scene

### Initial State

The playable starts with:

- One straight slide at **Level 1**.
- One customer currently sliding.
- Only the **Slide** upgrade button visible.

### Tutorial Guidance

- Display a pointer pointing at the **Slide** button.
- Display the text:

**UPGRADE IT!**

### After Upgrade

After the user upgrades the Slide:

- Show the other two upgrade buttons beside it.
- Remove the tutorial text.
- Remove the pointer.

The final button order should be:

**Speed → Slide → Lv Up**

---

## 8. End Scene

After all upgrades have reached their maximum level:

- Hide all three upgrade buttons.
- Replace them with one large button.
- Button text:

**NEXT RIDE!**

- The button should have a looping bounce/pulse animation.
- Tapping the button redirects the user to the store.

---

## 9. Suggested Gameplay Flow

1. Start with Tutorial Scene.
2. Player upgrades **Slide**.
3. Reveal **Speed**, **Slide**, and **Lv Up** buttons.
4. Customers continuously slide and generate **$5 per completed ride**.
5. Player upgrades:
   - Speed
   - Number of Slides
   - Slide Level
6. Show VFX for Speed and Slide upgrades.
7. After 5 seconds without interaction, show an upgrade hint pointer.
8. When all upgrades reach MAX:
   - Hide upgrade buttons.
   - Show **NEXT RIDE!**
9. Player taps **NEXT RIDE!**
10. Redirect to the store.
