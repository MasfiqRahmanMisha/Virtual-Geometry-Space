<div align="center">

# 📐 Virtual Geometry Space

### A Digital Geometry Instrument Workspace

**Draw • Measure • Construct • Save • Export**

<p>
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5">
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/SVG-FFB13B?style=for-the-badge&logo=svg&logoColor=black" alt="SVG">
</p>

<p>
  <b>Virtual Geometry Space</b> is a web-based interactive geometry workspace designed to simulate the experience of using real mathematical instruments on a digital canvas.
</p>

</div>

---

## ✨ Overview

**Virtual Geometry Space** is more than a simple drawing application.

It is designed as a **Virtual Geometry Instrument Workspace** where users can interact with digital versions of traditional geometry instruments and construct accurate geometry directly on an interactive SVG canvas.

The main goal is to make digital geometry feel similar to working with real instruments on paper.

> 🎯 **Core Idea:** Pick up a virtual instrument, position it, adjust it, and construct geometry naturally.

---

## 🎨 Features

| Feature | Description | Status |
|---|---|:---:|
| ✏️ **Pencil** | Freehand drawing on the canvas | 🟢 |
| 🧽 **Eraser** | Remove existing geometry objects | 🟢 |
| 📏 **Ruler** | Straight-line construction and measurement | 🟡 |
| 🧭 **Compass** | Physical-style interactive compass | 🟢 |
| 📐 **Protractor** | Angle measurement and construction | 🟡 |
| ↖️ **Select** | Select and inspect geometry objects | 🟢 |
| ✋ **Move** | Move geometry objects | 🟢 |
| ↶ **Undo** | Undo previous operations | 🟢 |
| ↷ **Redo** | Redo undone operations | 🟢 |
| 🔍 **Zoom** | Zoom in, zoom out and reset | 🟢 |
| 📊 **Measurements** | Length, radius, angle and arc length | 🟢 |
| 🗂️ **Object List** | View and manage geometry objects | 🟢 |
| 💾 **`.mas` Projects** | Save and reopen editable projects | 🟢 |
| 🖼️ **PNG Export** | Export final geometry as PNG | 🟢 |
| 🖼️ **JPG Export** | Export final geometry as JPG | 🟢 |
| 📄 **PDF Export** | Export final geometry as PDF | 🟢 |

### Status Legend

| Indicator | Meaning |
|:---:|---|
| 🟢 | Core feature |
| 🟡 | Planned / under development |

---

# 🖥️ Workspace Layout

The application uses a clean desktop-style workspace divided into four major areas.

| Area | Components | Purpose |
|---|---|---|
| 🧭 **Top Bar** | Undo, Redo, Zoom, New, Save, Open, Export | Project and workspace controls |
| 🛠️ **Left Toolbar** | Select, Pencil, Eraser, Ruler, Compass, Protractor, Move, Clear | Geometry instruments and editing tools |
| 🎨 **Center Canvas** | Interactive SVG Geometry Canvas | Main workspace for drawing and constructing geometry |
| 📊 **Right Panel** | Measurements, Objects, Help | Display measurements and manage created objects |

### Workspace Components

| Section | Available Options |
|---|---|
| **Top Bar** | ↶ Undo · ↷ Redo · 🔍 Zoom · 🆕 New · 💾 Save · 📂 Open · 🖼️ PNG · 🖼️ JPG · 📄 PDF |
| **Tools** | ↖️ Select · ✏️ Pencil · 🧽 Eraser · 📏 Ruler · 🧭 Compass · 📐 Protractor · ✋ Move · ❌ Clear |
| **Canvas** | SVG-based interactive geometry workspace with grid and drawing area |
| **Measurements** | Length · Radius · Angle · Arc Length |
| **Objects** | Lines · Arcs · Circles · Pencil Strokes · Angles |
| **Help** | Tool instructions and interaction guidance |

---

# 🧭 Interactive Compass

The **Compass** is the most important feature of Virtual Geometry Space.

It is not intended to behave like a simple **"Draw Arc"** button.

Instead, the application provides a **visible, physical-style virtual compass** that the user can manipulate directly on the canvas.

### Compass Structure

| Component | Function |
|---|---|
| 🔵 **Top Handle** | Move the complete compass |
| ⚙️ **Hinge / Joint** | Central mechanical connection |
| 🦿 **Needle Leg** | Holds the fixed center point |
| 📍 **Needle Tip** | Defines the center of the circle/arc |
| 🦿 **Pencil Leg** | Controls the opening |
| ✏️ **Pencil Tip** | Draws the actual arc |

### Compass Interaction

| User Action | Result |
|---|---|
| 🔵 Drag the top handle | Move the entire compass |
| ✏️ Drag the pencil leg/tip | Increase or decrease the opening |
| 📏 Change the opening | Change the drawing radius |
| 🔄 Rotate the compass | Move the pencil tip around the center |
| ✏️ Move the pencil tip | Draw an actual SVG arc |
| 🔄 Complete approximately 360° | Create a complete circle |

### Compass Workflow

```text
Select Compass
      ↓
Compass appears on canvas
      ↓
Move the compass
      ↓
Adjust pencil opening
      ↓
Set the desired radius
      ↓
Place the needle point
      ↓
Rotate the compass
      ↓
Pencil tip draws an arc
      ↓
Complete 360°
      ↓
Create a circle
