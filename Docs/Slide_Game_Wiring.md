# Slide Game – Hướng dẫn ráp scene

> **Đã có sẵn scene placeholder:** `assets/scenes/slide-scene.scene` + prefab
> `assets/Prefabs/CustomerPlaceholder.prefab`. Toàn bộ property trong bảng dưới
> **đã được gán sẵn** — tài liệu này là bản đồ để bạn thay art vào, không phải
> việc phải làm lại từ đầu. Xem mục 5 để biết cách thay.

Logic đã xong ở `assets/Src/Slide/`. Toàn bộ hành vi còn lại là **scene data** –
`@property` phải được gán trong editor, không gán thì component không chạy.

Game trạm xăng cũ **không bị đụng vào**. Slide game là scene riêng.

---

## 1. Cây node đề xuất

```
Scene
├── LifecycleManager        [GameLifecycleManager, tracking_component, tracking_global_listener]
└── Canvas
    ├── Camera
├── SlideGameManager        [SlideGameManager]
├── GameLayer
│   ├── Bg                  (sprite nền)
│   ├── SlideField          [SlideField]
│   │   ├── CustomerParent          → customerParent
│   │   ├── ExitCustomerParent      → exitCustomerParent
│   │   ├── QueueLeft               → queueLanes[0]   (children Q0..Qn, Q0 = đầu hàng)
│   │   │   ├── Q0 … Qn
│   │   ├── QueueRight              → queueLanes[1]
│   │   │   ├── Q0 … Qn
│   │   ├── SpawnLeft               → queueSpawnPoints[0]
│   │   ├── SpawnRight              → queueSpawnPoints[1]
│   │   ├── Level1                  → levels[0].root
│   │   │   ├── Track0 … Track10    [SlideTrack]  → levels[0].tracks
│   │   ├── Level2                  → levels[1].root
│   │   ├── Level3                  → levels[2].root
│   │   └── Level4                  → levels[3].root
│   └── SlideGame           [SlideGame]
└── RootUI
    ├── Top
    │   └── MoneyLabel              → UIManager.moneyLabel        (góc trên PHẢI)
    ├── Bottom
    │   └── PlayNowBtn              → click: SlideGameManager.onPlayNowClicked (góc dưới TRÁI)
    ├── UpgradePanel        [SlideUpgradePanel]
    │   ├── SpeedBtn        [UpgradeButton]   (trái)
    │   ├── SlideBtn        [UpgradeButton]   (giữa)
    │   ├── LvUpBtn         [UpgradeButton]   (phải)
    │   ├── NextRideBtn     [UpgradeButton]   (ẩn tới end scene)
    │   └── TutorialText            ("UPGRADE IT!")
    ├── UILayer             [UIManager]
    │   ├── WarningText
    │   └── EffectCoin      [CoinEffect]
    └── HintLayer
        └── CursorHint      [CursorHint]
```

Copy nguyên `UIManager`, `CoinEffect`, `CursorHint`, `UIScreenResolution`,
`UIOrientationWidget`, `SoundManager`, `BGM` từ `main-scene` sang – các component
này dùng lại 100%, không sửa dòng nào.

---

## 2. Gán property theo component

### `SlideGameManager`
| Property | Trỏ tới |
|---|---|
| `uiManager` | node `UILayer` |
| `coinEffect` | node `EffectCoin` |
| `slideGame` | node `SlideGame` |
| `upgradePanel` | node `UpgradePanel` |
| `field` | node `SlideField` |
| `audioContainerNode` | node `SoundManager` |

### `SlideField`
| Property | Ghi chú |
|---|---|
| `customerPrefabs` | ≥1 prefab khách, prefab **phải có component `Customer`** |
| `customerParent` / `exitCustomerParent` | 2 node rỗng, tách z-order |
| `queueLanes` | 2 node hàng chờ. **Child index 0 = đầu hàng (sát cầu trượt)** |
| `queueSpawnPoints` | cùng thứ tự với `queueLanes`, nơi khách xuất hiện |
| `levels` | 4 component `SlideLevel`, index 0 = Lv1 |

Sức chứa mỗi hàng chờ = số child đang `active` của node hàng chờ đó.

### `SlideLevel` (component gắn lên node gốc của mỗi level)
- Node gắn component này **chính là** root visual của level; `SlideField` tự bật/tắt.
- `tracks`: tất cả `SlideTrack` của level đó — **11 làn** (`BASE_LANE_COUNT` 1 + 10 upgrade)

### `SlideTrack` (mỗi làn)
| Property | Ghi chú |
|---|---|
| `laneIndex` | **0 = làn có sẵn lúc vào game**, 1..10 mở dần theo upgrade |
| `platformPoint` | chỗ khách đứng chờ trên đỉnh |
| `slidePath` | waypoint dọc máng trượt (không gồm cổng vòm). 3–5 điểm là đủ mượt |
| `archNode` | cổng vòm — chạm tới đây là **+$5** |
| `exitPath` | waypoint rời sân sau cổng vòm |
| `appearEffects` | spine VFX bật khi làn mới xuất hiện |
| `appearAnimName` | bỏ trống = dùng `defaultAnimation` của spine |

### `Customer` (trên prefab khách)
| Property | Ghi chú |
|---|---|
| `visualRoot` | node hình ảnh (để lật trái/phải). Bỏ trống = dùng node gốc |
| `skeleton` | spine — **optional**, để trống vẫn chạy được với sprite tĩnh |
| `idleAnimName` / `walkAnimName` / `slideAnimName` | tên anim spine |
| `speedBubble` | node chữ "Speed" nổi trên đầu khi upgrade speed (spec 4.1) |

### `UpgradeButton` (mỗi nút)
| Property | Ghi chú |
|---|---|
| `tapTarget` | node nhận tap + bounce. Bỏ trống = node gốc |
| `costLabel` | label giá; tự đổi thành `MAX` |
| `handTapTarget` | node nhỏ định vị bàn tay CursorHint |
| `buttonSprite` | sprite nền — bị tô `maxTint` (xám) khi MAX |
| `maxOverlay` | optional, phủ thêm khi MAX |
| `costInsufficientColor` | mặc định đỏ — dùng khi thiếu tiền (spec 5) |

> ⚠ Nếu gắn `cc.Button` + có `clickEvents` trên `tapTarget` thì `UpgradeButton`
> sẽ **không** tự bind touch (tôn trọng cấu hình editor). Muốn dùng logic sẵn có
> thì để `clickEvents` rỗng.

### `SlideUpgradePanel`
`speedButton` / `laneButton` / `levelButton` / `ctaButton` / `tutorialText`.
Thứ tự trái → phải **Speed · Slide · Lv Up** là do layout trong scene, code không ép.

### `SlideGame`
`field` → node `SlideField`, `panel` → node `UpgradePanel`.
(Manager cũng tự gán nếu để trống.)

---

## 3. Việc phải làm ngoài editor

1. **Build Settings → Start Scene** = scene mới.
2. `assets/configs/constant.ts`: đổi `TRACKING.PLAYABLE_ID`, `PACKAGE_NAME`,
   `STORE_LINK.ANDROID_LINK` / `IOS_LINK` cho app mới.
3. Responsive 2 chiều: **đã ráp sẵn** bằng `OrientationLayout` – xem mục 6.
4. SFX lúc khách bắt đầu trượt: `SlideField.onSlideStarted` hiện đang **để trống**
   (dòng comment trong `SlideGameManager.start()`), gán khi có file âm thanh.
5. **Đừng xoá node `LifecycleManager`** – xem mục 7.

---

## 4. Tuning

Mọi con số ở `assets/Src/Slide/SlideConfig.ts`. Giá trị hiện tại bám spec:

| | Giá | Số lần | Ghi chú |
|---|---|---|---|
| Speed | $20 | 10 | 4s × 0.85¹⁰ = **0.787s** ở MAX |
| Slide | $10 | 10 | 1 → 11 làn |
| Lv Up | $50 | 3 | Lv1 → Lv4, reset toàn bộ khách |

Tổng chi phí **$450 = 90 lượt trượt** ($5/lượt). `INITIAL_MONEY = 10` để tutorial
bấm được nút Slide ngay lập tức.

Cần chỉnh nhịp thì sửa `SPEED_STEP`, `INITIAL_MONEY`, `EARN_PER_RIDE`,
`CUSTOMER_SPAWN_INTERVAL` — không rải hằng số vào component.


---

## 5. Scene placeholder đã sinh sẵn

`assets/scenes/slide-scene.scene` – 405 node, mọi `@property` đã wire, chạy được
ngay không cần art. Placeholder dùng **`cc.Label` system font**, không phụ thuộc
sprite/spine nào.

### Thấy gì khi chạy
- 11 làn/level dựng bằng label `L1·0` … `L1·10` (platform) và `===` (cổng vòm);
  chỉ làn `Track0` bật lúc đầu, các làn sau bật dần khi upgrade Slide.
- Khách = label `O`, xếp 2 hàng 5 chỗ hai bên (`QueueLeft` / `QueueRight`).
- HUD: `$0` góc trên phải, `PLAY NOW` góc dưới trái, 3 nút SPEED · SLIDE · LV UP
  ở giữa dưới, `UPGRADE IT!` phía trên chúng, `^` là hand pointer.
- 4 level đều dựng sẵn với spacing khác nhau để thấy layout đổi khi Lv Up.

### Thay art vào
| Thay gì | Làm thế nào |
|---|---|
| Khách | Mở `CustomerPlaceholder.prefab`, thay node `Visual` (Label) bằng Sprite/Spine, gán lại `Customer.skeleton` + `visualRoot` |
| Cầu trượt | Thêm sprite vào từng node `TrackN`, rồi **kéo lại vị trí** `Platform` / `SP1` / `SP2` / `Arch` cho khớp hình |
| VFX làn mới | Đặt spine vào node `AppearFx` của mỗi track (đang rỗng, `active = false`) |
| Bubble "Speed" | Node `SpeedBubble` trong prefab khách |
| Nút upgrade | Thêm `cc.Sprite` cho `SpeedBtn`/`SlideBtn`/`LvUpBtn`, gán vào `UpgradeButton.buttonSprite` để trạng thái MAX tô xám được |
| Coin popup | Gán `CoinEffect.coinLabelPrefab` (đang `null` – tiền vẫn cộng, chỉ không có popup) |
| Âm thanh | Node `SoundManager` có sẵn `AudioContainer`, 7 slot đang `null` – thêm `AudioSource` con rồi gán vào |
| Hand pointer | Node `Hand` dưới `CursorHint` |

### Chưa gán (cố ý, chờ resource)
`CoinEffect.coinLabelPrefab`, `CoinEffect.multiplierLabelPrefab`,
`UIManager.warningAnim`, `UpgradeButton.buttonSprite`, `UpgradeButton.maxOverlay`,
`SlideTrack.appearEffects` (node rỗng), 7 slot của `AudioContainer`.
Code đã guard `null` ở tất cả các chỗ này – thiếu thì chỉ mất hiệu ứng, không crash.

### Sinh lại scene
Generator: `Docs/slide_scene_generator.py` (chạy từ thư mục gốc project). Scene là file thường,
sửa trong editor thoải mái – **không cần chạy lại generator**.


---

## 6. Responsive (portrait + landscape)

Project để **`fitHeight`, design 720×1280**. Hệ quả quan trọng: khi xoay ngang
**chiều cao hiển thị không đổi** (vẫn 1280 design-px), chỉ **rộng ra rất nhiều**
(16:9 → 2276×1280). Nên bài toán không phải "thu nhỏ cho vừa" mà là **dạt HUD ra
rìa và dịch sân chơi sang một bên**.

### Component: `OrientationLayout`
Đặt node theo **neo + offset + scale** riêng cho từng chiều. Nó tự đo
`UITransform` của **node cha** nên không cần event bus, và cập nhật lại khi cha
đổi kích thước (`SIZE_CHANGED`) → xoay máy giữa chừng vẫn đúng.

| Property | Ý nghĩa |
|---|---|
| `portraitAnchor` / `landscapeAnchor` | 1 trong 9 neo: `TOP_LEFT … BOTTOM_RIGHT` |
| `portraitOffset` / `landscapeOffset` | lệch so với neo (design-px). Neo phải/trên thì dùng **số âm** để đi vào trong |
| `portraitScale` / `landscapeScale` | **nhân** vào scale gốc của node trong scene |

> Điều kiện: node cha phải bám khung nhìn — tức `Canvas` (`alignCanvasWithScreen`)
> hoặc node full-screen stretch bằng `cc.Widget`. Trong scene các node stretch là:
> `Canvas`, `RootUI`, `UpgradePanel`, `UILayer`, `HintLayer`.
>
> **Không đặt `cc.Widget` chung node với `OrientationLayout`** — Widget sẽ ghi đè
> vị trí mỗi frame và đá nhau. Scene hiện tại đã tách đúng.

### Giá trị đã cấu hình

| Node | Màn dọc | Màn ngang |
|---|---|---|
| `GameLayer` | CENTER (0, 90) ×1.0 | CENTER (−60, 20) **×1.4** |
| `MoneyLabel` | TOP_RIGHT (−36, −60) | TOP_RIGHT (−44, −48) |
| `PlayNowBtn` | BOTTOM_LEFT (151, 90) | BOTTOM_LEFT (151, 78) |
| `SpeedBtn` | BOTTOM_CENTER (−220, 200) | MIDDLE_RIGHT (−150, **190**) |
| `SlideBtn` | BOTTOM_CENTER (0, 200) | MIDDLE_RIGHT (−150, **0**) |
| `LvUpBtn` | BOTTOM_CENTER (220, 200) | MIDDLE_RIGHT (−150, **−190**) |
| `NextRideBtn` | BOTTOM_CENTER (0, 220) | MIDDLE_RIGHT (−300, 0) |
| `TutorialText` | BOTTOM_CENTER (0, 400) | MIDDLE_RIGHT (−280, 330) |

Tức là: **dọc** → 3 nút xếp ngang dưới đáy (đúng spec); **ngang** → 3 nút xếp
**dọc thành cột bên phải**, sân chơi phóng to 1.4× và dịch sang trái.

Đã kiểm tra bounds ở 720×1280, 2276×1280 (16:9) và 1707×1280 (4:3): không
element HUD nào tràn mép, money không đè lên cột nút.

### Vì sao không dùng `UIScreenResolution` / `UIOrientationWidget` của game cũ
- `UIOrientationWidget` phụ thuộc nested class `UIWidgetConfig`.
- `UIScreenResolution.resizeToFullScreen()` chỉ `emit(ORIENTATION_CHANGED)`
  **bên trong nhánh portrait**, nên xoay sang landscape không phát sự kiện nào →
  `UIOrientationWidget` chỉ chạy đúng đúng 1 lần lúc `onEnable`. (Trong
  `main-scene` không có instance `UIOrientationWidget` nào nên lỗi này chưa bao
  giờ lộ ra.) Hai file cũ **giữ nguyên, không sửa**.


---

## 7. LifecycleManager & tracking

Scene có node `LifecycleManager` ở gốc, dựng **y hệt `main-scene`**:

| Component | Việc |
|---|---|
| `GameLifecycleManager` | Đăng ký các class `@register_lifecycle` (`ITickable`/`IInitializable`/…). Hiện chưa class nào dùng – có sẵn để dùng về sau |
| `tracking_component` | `startSession()` + `start()`, bắt first-input trên Canvas, global TOUCH_END → `record_hit()` + `recordRawInteract()`, `Dispose()` → `end()` |
| `tracking_global_listener` | `pagehide` / `beforeunload` / `visibilitychange` → `end()` |

`tracking_component.canvasNode` → node `Canvas`. Thứ tự component **không đổi
được**: `GameLifecycleManager` phải `onLoad` trước, nếu không `LifecycleComponent`
rơi vào nhánh chờ `EVENT_AFTER_SCENE_LAUNCH`.

### Vì sao `SlideGameManager` không còn tự tracking session

Bản đầu `SlideGameManager` tự gọi `startSession()`/`start()`, tự bind `TOUCH_END`
và `pagehide`. Chạy song song với `tracking_component` thì **hỏng số liệu**, vì
trong `tracking_service`:

- `start()` và `end()` **có** cờ chống gọi trùng (`_startFired` / `_endFired`) → an toàn.
- `startSession()` **không có** – nó `resetSession()` và đặt lại `_startFired = false`.
  Gọi lần 2 sau khi đã `start()` → **bắn event "start" lần thứ hai** và xoá sạch bộ đếm hit.
- `record_hit()` **không có** → mỗi lần chạm bị **đếm 2 lần** (hit-map lẫn `interact_count`).

Nên vòng đời session giao hết cho `tracking_component`. `SlideGameManager` chỉ còn
bắn event nghiệp vụ: `trackInteraction('speed_upgraded' | 'lane_added' | 'level_up' |
'insufficient_funds' | 'all_upgrades_maxed')` và `trackStoreTrigger('cta_store')`.
Một lợi ích kèm theo: `recordRawInteract()` giờ mới thực sự được gọi – trước đó
`SlideGameManager` không gọi nên `end()` sẽ báo `interact_count: 0`.

> ⚠ **`main-scene` đang dính đúng lỗi này**: `GameManager.setupTracking()` chạy song
> song với `tracking_component` trên node `LifecycleManager` → gửi 2 event "start"
> và đếm đôi mọi tap. Tôi **không sửa** `main-scene`/`GameManager.ts` (ngoài phạm vi
> việc này), chỉ ghi lại để bạn quyết định.
