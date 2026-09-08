import json, random, uuid, os

B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

# Class-id của 1 script = uuid[0:5] + 9 nhóm 3 hex → 2 ký tự base64.
# Chạy từ thư mục gốc project.
_SCRIPTS = {
    'Customer': 'assets/Src/Slide/Customer.ts.meta',
    'SlideTrack': 'assets/Src/Slide/SlideTrack.ts.meta',
    'SlideLevel': 'assets/Src/Slide/SlideLevel.ts.meta',
    'SlideField': 'assets/Src/Slide/SlideField.ts.meta',
    'UpgradeButton': 'assets/Src/Slide/UpgradeButton.ts.meta',
    'SlideUpgradePanel': 'assets/Src/Slide/SlideUpgradePanel.ts.meta',
    'SlideGame': 'assets/Src/Slide/SlideGame.ts.meta',
    'SlideGameManager': 'assets/Src/Slide/SlideGameManager.ts.meta',
    'CoinEffect': 'assets/Src/Effects/CoinEffect.ts.meta',
    'UIManager': 'assets/Src/Core/UIManager.ts.meta',
    'CursorHint': 'assets/Src/Effects/CursorHint.ts.meta',
    'AudioContainer': 'assets/Src/Core/AudioContainer.ts.meta',
    'OrientationLayout': 'assets/Src/Slide/OrientationLayout.ts.meta',
    'GameLifecycleManager':
        'assets/plugins/playable-foundation/game-foundation/lifecycle_manager/GameLifecycleManager.ts.meta',
    'tracking_component': 'assets/plugins/playable-foundation/tracking/tracking_component.ts.meta',
    'tracking_global_listener':
        'assets/plugins/playable-foundation/tracking/tracking_global_listener.ts.meta',
}

# Neo màn hình, khớp enum ScreenAnchor trong OrientationLayout.ts
TL, TC, TR, ML, C, MR, BL, BC, BR = range(9)

def cid(name):
    h = json.load(open(_SCRIPTS[name]))['uuid'].replace('-', '')
    out = h[:5]
    for i in range(5, 32, 3):
        v = int(h[i:i + 3], 16)
        out += B64[v >> 6] + B64[v & 63]
    return out

rng = random.Random(20260829)
def rid():  # _id kiểu Cocos: 22 ký tự base64
    return ''.join(rng.choice(B64) for _ in range(22))
def fid():  # fileId của prefab: 22 ký tự
    return ''.join(rng.choice(B64) for _ in range(22))

UI2D = 33554432
V3 = lambda x=0, y=0, z=0: {"__type__": "cc.Vec3", "x": x, "y": y, "z": z}
QUAT = lambda: {"__type__": "cc.Quat", "x": 0, "y": 0, "z": 0, "w": 1}
SIZE = lambda w, h: {"__type__": "cc.Size", "width": w, "height": h}
V2 = lambda x, y: {"__type__": "cc.Vec2", "x": x, "y": y}
COL = lambda r, g, b, a=255: {"__type__": "cc.Color", "r": r, "g": g, "b": b, "a": a}


class Doc:
    def __init__(self, prefab_mode=False):
        self.o = []
        self.prefab_mode = prefab_mode

    def push(self, d):
        self.o.append(d)
        return len(self.o) - 1

    def _prefab_slot(self, kind):
        """Trong .prefab mỗi node/component cần PrefabInfo/CompPrefabInfo riêng."""
        if not self.prefab_mode:
            return None
        t = "cc.PrefabInfo" if kind == 'node' else "cc.CompPrefabInfo"
        if kind == 'node':
            return {"__type__": t, "root": {"__id__": 1}, "asset": {"__id__": 0},
                    "fileId": fid(), "instance": None, "targetOverrides": None}
        return {"__type__": t, "fileId": fid()}

    def node(self, name, parent, pos=(0, 0, 0), scale=(1, 1, 1), active=True, layer=UI2D):
        d = {"__type__": "cc.Node", "_name": name, "_objFlags": 0, "__editorExtras__": {},
             "_parent": {"__id__": parent} if parent is not None else None,
             "_children": [], "_active": active, "_components": [], "_prefab": None,
             "_lpos": V3(*pos), "_lrot": QUAT(), "_lscale": V3(*scale),
             "_mobility": 0, "_layer": layer, "_euler": V3(), "_id": rid()}
        i = self.push(d)
        if self.prefab_mode:
            d["_prefab"] = {"__id__": self.push(self._prefab_slot('node'))}
        if parent is not None:
            self.o[parent]["_children"].append({"__id__": i})
        return i

    def comp(self, node_id, type_name, **props):
        d = {"__type__": type_name, "_name": "", "_objFlags": 0, "__editorExtras__": {},
             "node": {"__id__": node_id}, "_enabled": True, "__prefab": None}
        d.update(props)
        d["_id"] = "" if self.prefab_mode else rid()
        i = self.push(d)
        if self.prefab_mode:
            d["__prefab"] = {"__id__": self.push(self._prefab_slot('comp'))}
        self.o[node_id]["_components"].append({"__id__": i})
        return i

    # ── component helper ─────────────────────────────────────────
    def uit(self, n, w=100, h=100, ax=0.5, ay=0.5):
        return self.comp(n, "cc.UITransform", _contentSize=SIZE(w, h), _anchorPoint=V2(ax, ay))

    def label(self, n, text, size=28, color=(255, 255, 255), bold=True, align=1):
        return self.comp(n, "cc.Label",
                         _customMaterial=None, _srcBlendFactor=2, _dstBlendFactor=4,
                         _color=COL(*color), _string=text,
                         _horizontalAlign=align, _verticalAlign=1,
                         _actualFontSize=size, _fontSize=size, _fontFamily="Arial",
                         _lineHeight=size + 4, _overflow=0, _enableWrapText=False,
                         _font=None, _isSystemFontUsed=True, _spacingX=0,
                         _isItalic=False, _isBold=bold, _isUnderline=False,
                         _underlineHeight=2, _cacheMode=0,
                         _enableOutline=True, _outlineColor=COL(0, 0, 0), _outlineWidth=3,
                         _enableShadow=False, _shadowColor=COL(0, 0, 0, 255),
                         _shadowOffset=V2(2, 2), _shadowBlur=2)

    def widget(self, n, flags, **kw):
        base = dict(_alignFlags=(15 if flags == 45 else flags), _target=None, _left=0, _right=0, _top=0, _bottom=0,
                    _horizontalCenter=0, _verticalCenter=0,
                    _isAbsLeft=True, _isAbsRight=True, _isAbsTop=True, _isAbsBottom=True,
                    _isAbsHorizontalCenter=True, _isAbsVerticalCenter=True,
                    _originalWidth=0, _originalHeight=0, _alignMode=2, _lockFlags=0)
        base.update(kw)
        return self.comp(n, "cc.Widget", **base)

    def opacity(self, n, value=255):
        return self.comp(n, "cc.UIOpacity", _opacity=value)

    def stretch(self, n):
        """Widget phủ kín parent – để con dùng OrientationLayout neo theo khung màn hình."""
        return self.widget(n, 45, _isAlignLeft=True, _isAlignRight=True,
                           _isAlignTop=True, _isAlignBottom=True)

    def orient(self, n, p_anchor, p_off, l_anchor, l_off, p_scale=1, l_scale=1):
        return self.comp(n, cid('OrientationLayout'),
                         portraitAnchor=p_anchor, portraitOffset=V2(*p_off),
                         portraitScale=p_scale,
                         landscapeAnchor=l_anchor, landscapeOffset=V2(*l_off),
                         landscapeScale=l_scale)


# ═══════════════════════════════════════════════════════════════
#  1) Prefab khách placeholder
# ═══════════════════════════════════════════════════════════════
def build_customer_prefab(path):
    p = Doc(prefab_mode=True)
    p.push({"__type__": "cc.Prefab", "_name": "CustomerPlaceholder", "_objFlags": 0,
            "__editorExtras__": {}, "_native": "", "data": {"__id__": 1},
            "optimizationPolicy": 0, "persistent": False})
    root = p.node("CustomerPlaceholder", None)
    p.uit(root, 48, 48)

    visual = p.node("Visual", root)
    p.uit(visual, 48, 48)
    p.label(visual, "O", 40, (255, 210, 90))

    bubble = p.node("SpeedBubble", root, pos=(0, 46, 0))
    p.uit(bubble, 120, 36)
    p.label(bubble, "Speed", 26, (120, 255, 160))

    p.comp(root, cid('Customer'),
           visualRoot={"__id__": visual}, skeleton=None,
           idleAnimName="idle", walkAnimName="walk", slideAnimName="slide",
           flipWhenMovingLeft=True, speedBubble={"__id__": bubble})

    json.dump(p.o, open(path, 'w'), indent=2)
    return p


# ═══════════════════════════════════════════════════════════════
#  2) Scene
# ═══════════════════════════════════════════════════════════════
LANES = 11
LEVEL_GEOM = [  # (platY, spacing, archY)
    (330, 58, -110),
    (360, 52, -140),
    (330, 46, -170),
    (300, 40, -200),
]

def build_scene(path, customer_prefab_uuid, scene_uuid):
    s = Doc()
    s.push({"__type__": "cc.SceneAsset", "_name": "slide-scene", "_objFlags": 0,
            "__editorExtras__": {}, "_native": "", "scene": {"__id__": 1}})
    scene = s.push({"__type__": "cc.Scene", "_name": "slide-scene", "_objFlags": 0,
                    "__editorExtras__": {}, "_parent": None, "_children": [], "_active": True,
                    "_components": [], "_prefab": None, "_lpos": V3(), "_lrot": QUAT(),
                    "_lscale": V3(1, 1, 1), "_mobility": 0, "_layer": 1073741824,
                    "_euler": V3(), "autoReleaseAssets": False, "_globals": None,
                    "_id": scene_uuid})

    # LifecycleManager – dựng giống main-scene, là node đầu tiên của scene.
    lifecycle_node = s.node("LifecycleManager", scene, layer=1073741824)

    canvas = s.node("Canvas", scene, pos=(360, 640, 0))
    cam_node = s.node("Camera", canvas, pos=(0, 0, 1000))
    cam = s.comp(cam_node, "cc.Camera",
                 _projection=0, _priority=0, _fov=45, _fovAxis=0, _orthoHeight=640,
                 _near=1, _far=2000, _color=COL(20, 24, 32), _depth=1, _stencil=0,
                 _clearFlags=7, _rect={"__type__": "cc.Rect", "x": 0, "y": 0, "width": 1, "height": 1},
                 _aperture=19, _shutter=7, _iso=0, _screenScale=1,
                 _visibility=41943040, _targetTexture=None, _postProcess=None,
                 _usePostProcess=False, _cameraType=-1, _trackingType=0)
    s.uit(canvas, 720, 1280)
    s.comp(canvas, "cc.Canvas", _cameraComponent={"__id__": cam}, _alignCanvasWithScreen=True)
    s.widget(canvas, 45)

    # Thứ tự component quan trọng: GameLifecycleManager phải onLoad trước để
    # LifecycleComponent (tracking_component) đăng ký được ngay, không phải
    # rơi vào nhánh chờ EVENT_AFTER_SCENE_LAUNCH.
    s.comp(lifecycle_node, cid('GameLifecycleManager'))
    s.comp(lifecycle_node, cid('tracking_component'), canvasNode={"__id__": canvas})
    s.comp(lifecycle_node, cid('tracking_global_listener'))

    manager_node = s.node("SlideGameManager", canvas)
    game_layer = s.node("GameLayer", canvas)
    s.orient(game_layer, C, (0, 90), C, (-60, 20), p_scale=1.0, l_scale=1.4)

    # ── SlideField ───────────────────────────────────────────────
    field_node = s.node("SlideField", game_layer)
    customer_parent = s.node("CustomerParent", field_node)
    exit_parent = s.node("ExitCustomerParent", field_node)

    queue_lane_ids, spawn_ids = [], []
    for side, sx in (("Left", -338), ("Right", 338)):
        lane = s.node(f"Queue{side}", field_node)
        for q in range(5):
            s.node(f"Q{q}", lane, pos=(sx, 300 - q * 58, 0))
        queue_lane_ids.append(lane)
        spawn_ids.append(s.node(f"Spawn{side}", field_node, pos=(sx, 300 - 5 * 58, 0)))

    level_comp_ids = []
    for lv, (plat_y, spacing, arch_y) in enumerate(LEVEL_GEOM, start=1):
        lv_node = s.node(f"Level{lv}", field_node, active=(lv == 1))
        track_comp_ids = []
        for i in range(LANES):
            x = (i - (LANES - 1) / 2) * spacing
            t_node = s.node(f"Track{i}", lv_node, active=(i == 0))

            plat = s.node("Platform", t_node, pos=(x, plat_y, 0))
            s.uit(plat, spacing - 6, 40)
            s.label(plat, f"L{lv}·{i}", 18, (200, 220, 255))

            sp1 = s.node("SP1", t_node, pos=(x, plat_y - (plat_y - arch_y) * 0.34, 0))
            sp2 = s.node("SP2", t_node, pos=(x, plat_y - (plat_y - arch_y) * 0.68, 0))

            arch = s.node("Arch", t_node, pos=(x, arch_y, 0))
            s.uit(arch, spacing - 6, 34)
            s.label(arch, "===", 20, (255, 190, 90))

            ex1 = s.node("Exit1", t_node, pos=(x, arch_y - 150, 0))
            ex2 = s.node("Exit2", t_node, pos=(x * 1.8, arch_y - 320, 0))

            fx = s.node("AppearFx", t_node, active=False)

            track_comp_ids.append(s.comp(
                t_node, cid('SlideTrack'),
                laneIndex=i,
                platformPoint={"__id__": plat},
                slidePath=[{"__id__": sp1}, {"__id__": sp2}],
                archNode={"__id__": arch},
                exitPath=[{"__id__": ex1}, {"__id__": ex2}],
                appearEffects=[{"__id__": fx}],
                appearAnimName=""))

        level_comp_ids.append(s.comp(lv_node, cid('SlideLevel'),
                                     tracks=[{"__id__": t} for t in track_comp_ids]))

    field_comp = s.comp(
        field_node, cid('SlideField'),
        customerPrefabs=[{"__uuid__": customer_prefab_uuid, "__expectedType__": "cc.Prefab"}],
        customerParent={"__id__": customer_parent},
        exitCustomerParent={"__id__": exit_parent},
        queueLanes=[{"__id__": q} for q in queue_lane_ids],
        queueSpawnPoints=[{"__id__": sp} for sp in spawn_ids],
        levels=[{"__id__": l} for l in level_comp_ids])

    # ── RootUI ───────────────────────────────────────────────────
    root_ui = s.node("RootUI", canvas)
    s.uit(root_ui, 720, 1280)
    s.stretch(root_ui)

    money = s.node("MoneyLabel", root_ui)
    s.uit(money, 200, 60, ax=1.0)
    money_label = s.label(money, "$0", 46, (255, 224, 130), align=2)
    s.orient(money, TR, (-36, -60), TR, (-44, -48))

    play_now = s.node("PlayNowBtn", root_ui)
    s.uit(play_now, 230, 84)
    s.label(play_now, "PLAY NOW", 30, (255, 255, 255))
    s.orient(play_now, BL, (151, 90), BL, (151, 78))

    # ── Upgrade panel: container phủ kín màn, từng nút tự neo ────
    panel_node = s.node("UpgradePanel", root_ui)
    s.uit(panel_node, 720, 1280)
    s.stretch(panel_node)

    def make_button(name, title, p_off, l_off, w=190, h=150, cost="0"):
        b = s.node(name, panel_node)
        s.uit(b, w, h)
        t = s.node("Title", b, pos=(0, 36, 0))
        s.uit(t, w, 40); s.label(t, title, 26, (255, 255, 255))
        c = s.node("Cost", b, pos=(0, -34, 0))
        s.uit(c, w, 44); cost_label = s.label(c, f"${cost}", 32, (255, 255, 255))
        hand = s.node("HandAnchor", b, pos=(0, -h / 2 - 10, 0))
        s.orient(b, BC, p_off, MR, l_off)
        comp = s.comp(b, cid('UpgradeButton'),
                      tapTarget={"__id__": b},
                      costLabel={"__id__": cost_label},
                      handTapTarget={"__id__": hand},
                      buttonSprite=None, maxOverlay=None,
                      normalTint=COL(255, 255, 255), maxTint=COL(130, 130, 130),
                      costNormalColor=COL(255, 255, 255),
                      costInsufficientColor=COL(255, 70, 70),
                      costMaxColor=COL(220, 220, 220),
                      costPrefix="$", maxText="MAX")
        return b, comp

    _, speed_btn = make_button("SpeedBtn", "SPEED", (-220, 200), (-150, 190), cost="20")
    _, slide_btn = make_button("SlideBtn", "SLIDE", (0, 200), (-150, 0), cost="10")
    _, lvup_btn = make_button("LvUpBtn", "LV UP", (220, 200), (-150, -190), cost="50")

    cta_node = s.node("NextRideBtn", panel_node, active=False)
    s.uit(cta_node, 520, 150)
    s.orient(cta_node, BC, (0, 220), MR, (-300, 0))
    cta_title = s.node("Title", cta_node)
    s.uit(cta_title, 520, 60); s.label(cta_title, "NEXT RIDE!", 44, (255, 245, 200))
    cta_hand = s.node("HandAnchor", cta_node, pos=(0, -90, 0))
    cta_btn = s.comp(cta_node, cid('UpgradeButton'),
                     tapTarget={"__id__": cta_node}, costLabel=None,
                     handTapTarget={"__id__": cta_hand},
                     buttonSprite=None, maxOverlay=None,
                     costPrefix="$", maxText="MAX")

    tut_text = s.node("TutorialText", panel_node)
    s.uit(tut_text, 520, 60)
    s.orient(tut_text, BC, (0, 400), MR, (-280, 330))
    s.label(tut_text, "UPGRADE IT!", 40, (255, 235, 120))

    panel_comp = s.comp(panel_node, cid('SlideUpgradePanel'),
                        speedButton={"__id__": speed_btn},
                        laneButton={"__id__": slide_btn},
                        levelButton={"__id__": lvup_btn},
                        ctaButton={"__id__": cta_btn},
                        tutorialText={"__id__": tut_text})

    # ── UILayer / hint / effect ──────────────────────────────────
    ui_layer = s.node("UILayer", root_ui)
    s.uit(ui_layer, 720, 1280)
    s.stretch(ui_layer)

    warning = s.node("WarningText", ui_layer, pos=(0, 120, 0), active=False)
    s.uit(warning, 620, 70)
    s.label(warning, "NOT ENOUGH MONEY!", 38, (255, 90, 90))
    s.opacity(warning)

    effect_coin = s.node("EffectCoin", ui_layer)
    s.uit(effect_coin, 720, 1280)
    coin_comp = s.comp(effect_coin, cid('CoinEffect'),
                       coinLabelPrefab=None, multiplierLabelPrefab=None,
                       multiplierOffset=V3(), moneyTargetNode={"__id__": money})

    hint_layer = s.node("HintLayer", root_ui)
    s.uit(hint_layer, 720, 1280)
    s.stretch(hint_layer)
    cursor = s.node("CursorHint", hint_layer)  # onLoad tự ẩn
    s.uit(cursor, 120, 120)
    s.opacity(cursor)
    hand = s.node("Hand", cursor)
    s.uit(hand, 90, 90)
    s.label(hand, "^", 60, (255, 255, 255))
    cursor_comp = s.comp(cursor, cid('CursorHint'),
                         offset=V3(0, -30, 0), handOffset=V3(0, -70, 0),
                         giftHandOffset=V3(0, -30, 0),
                         handScale=V3(1, 1, 1), giftHandScale=V3(1, 1, 1),
                         holeWidth=220, holeHeight=120, holePaddingX=24, holePaddingY=24,
                         overlayColor=COL(0, 0, 0, 180), overlayEnabled=False,
                         overlayNode=None, holeNode=None, handTut={"__id__": hand})

    ui_comp = s.comp(ui_layer, cid('UIManager'),
                     moneyLabel={"__id__": money_label},
                     warningTextNode={"__id__": warning},
                     warningAnim=None, warningAnimName="warning",
                     cursorHint={"__id__": cursor_comp})

    # ── SlideGame + Manager ──────────────────────────────────────
    game_node = s.node("SlideGame", game_layer)
    game_comp = s.comp(game_node, cid('SlideGame'),
                       field={"__id__": field_comp}, panel={"__id__": panel_comp})

    sound = s.node("SoundManager", scene, layer=1073741824)
    s.comp(sound, cid('AudioContainer'),
           soundWarning=None, soundUnlock=None, soundCollectCoin=None,
           soundRefueling=None, soundCarHorn=None, soundMaleSad=None, soundClick=None)

    manager_comp = s.comp(manager_node, cid('SlideGameManager'),
                          uiManager={"__id__": ui_comp},
                          coinEffect={"__id__": coin_comp},
                          slideGame={"__id__": game_comp},
                          upgradePanel={"__id__": panel_comp},
                          field={"__id__": field_comp},
                          audioContainerNode={"__id__": sound})

    # PlayNow button → manager.onPlayNowClicked
    click = s.push({"__type__": "cc.ClickEvent", "target": {"__id__": manager_node},
                    "component": "", "_componentId": cid('SlideGameManager'),
                    "handler": "onPlayNowClicked", "customEventData": ""})
    s.comp(play_now, "cc.Button",
           clickEvents=[{"__id__": click}], _interactable=True, _transition=0,
           _normalColor=COL(255, 255, 255), _hoverColor=COL(211, 211, 211),
           _pressedColor=COL(255, 255, 255), _disabledColor=COL(124, 124, 124),
           _normalSprite=None, _hoverSprite=None, _pressedSprite=None,
           _disabledSprite=None, _duration=0.1, _zoomScale=1.2, _target=None)

    # ── SceneGlobals (copy nguyên từ main-scene) ─────────────────
    src = json.load(open('assets/scenes/main-scene.scene'))
    g_start = None
    for i, o in enumerate(src):
        if isinstance(o, dict) and o.get('__type__') == 'cc.SceneGlobals':
            g_start = i
            break
    offset = len(s.o) - g_start
    def remap(v):
        if isinstance(v, dict):
            if set(v.keys()) == {'__id__'}:
                return {"__id__": v['__id__'] + offset}
            return {k: remap(x) for k, x in v.items()}
        if isinstance(v, list):
            return [remap(x) for x in v]
        return v
    for o in src[g_start:]:
        s.push(remap(o))
    s.o[scene]["_globals"] = {"__id__": g_start + offset}

    json.dump(s.o, open(path, 'w'), indent=2)
    return s


if __name__ == '__main__':
    os.makedirs('assets/Prefabs', exist_ok=True)
    def keep_uuid(meta_path):
        """Sinh lại không được đổi uuid, nếu không scene/prefab thành asset mới."""
        if os.path.exists(meta_path):
            return json.load(open(meta_path))['uuid']
        return str(uuid.uuid4())

    prefab_uuid = keep_uuid('assets/Prefabs/CustomerPlaceholder.prefab.meta')
    scene_uuid = keep_uuid('assets/scenes/slide-scene.scene.meta')

    build_customer_prefab('assets/Prefabs/CustomerPlaceholder.prefab')
    json.dump({"ver": "1.1.50", "importer": "prefab", "imported": True, "uuid": prefab_uuid,
               "files": [".json"], "subMetas": {},
               "userData": {"syncNodeName": "CustomerPlaceholder"}},
              open('assets/Prefabs/CustomerPlaceholder.prefab.meta', 'w'), indent=2)

    build_scene('assets/scenes/slide-scene.scene', prefab_uuid, scene_uuid)
    json.dump({"ver": "1.1.50", "importer": "scene", "imported": True, "uuid": scene_uuid,
               "files": [".json"], "subMetas": {}, "userData": {}},
              open('assets/scenes/slide-scene.scene.meta', 'w'), indent=2)
    print("prefab uuid:", prefab_uuid)
    print("scene  uuid:", scene_uuid)
