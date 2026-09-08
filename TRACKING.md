# Tracking Documentation

## 1) Pham vi

Tai lieu nay mo ta he thong Tracking dang duoc dung cho:

- Cap nhat tien do quest qua `TrackingQuestSignal`.
- Dong bo tien do theo `TrackingType` (`Total` / `InQuest`).
- Tich hop mot phan analytics dua tren cung signal tracking.

## 2) File chinh

- `Assets/Scripts/QuestModule/QuestInstaller.cs`
- `Assets/Scripts/QuestModule/Signals/TrackingQuestSignal.cs`
- `Assets/Scripts/QuestModule/TrackingQuestServices.cs`
- `Assets/Scripts/QuestModule/TrackingQuestData.cs`
- `Assets/Scripts/QuestModule/SignalBatchQueue.cs`
- `Assets/Scripts/QuestModule/Interfaces/*.cs` (matcher theo condition)
- `Assets/Scripts/QuestModule/Blueprints/BaseQuestRecord.cs` (`TrackingType`)
- `Assets/Scripts/ThirdPartyServices/Analytic/AnalyticServiceHandler.cs`
- `Assets/Scripts/AdventureWorld/CommonSystems/InitializeWorldEntitiesSystem.cs`

## 3) Signal contract

`TrackingQuestSignal` co 3 truong:

- `RequirementType`: loai requirement (thuong dung constant trong `StaticValue.RequirementQuestStaticValue`).
- `RequirementIds`: danh sach id muc tieu (co the rong).
- `RequirementValue`: gia tri cong/tru vao progress.

Vi du:

```csharp
signalBus.Fire(new TrackingQuestSignal(
    StaticValue.RequirementQuestStaticValue.KillEnemy,
    new List<string> { enemyId },
    1));
```

## 4) Luong xu ly quest tracking

### 4.1 Dang ky va queue

- `QuestInstaller` khai bao signal `TrackingQuestSignal`.
- `TrackingQuestServices` subscribe signal trong `OnDataInitialized()`.
- Signal khong xu ly ngay, ma duoc dua vao `SignalBatchQueue<TrackingQuestSignal>`.

### 4.2 Flush theo batch

Trong `LateTick()`:

- Moi `0.1s` se flush queue 1 lan (`flushInterval = 0.1f`).
- Moi lan flush xu ly toi da `20` signal (`maxPerFrame = 20`).
- Neu co thay doi progress, he thong fire `RefreshQuestViewSignal` 1 lan sau flush.

### 4.3 Cache tracking tong

`TrackingQuestData.TrackingCached` co cau truc:

`Dictionary<requirementType, Dictionary<requirementId, value>>`

Quy tac cap nhat cache:

- Luon cong vao key `string.Empty` (tong theo type, khong phan id).
- Neu `RequirementIds` co id hop le, cong them vao tung id do.

### 4.4 Match requirement va cap nhat progress

Voi moi quest/task dang `InProgress`, he thong:

1. Loc requirement cung `RequirementType`.
2. Kiem tra `RequirementId`:
   - Requirement id rong => match moi signal cung type.
   - Requirement id co gia tri => `RequirementIds` phai chua id do.
3. Neu requirement co condition (`IQuestRequirementWithCondition`), chay matcher theo `RequirementConditionId`.
4. Cap nhat `CurrentValue`:
   - `TrackingType.Total`: doc tu cache tong (`TrackingCached`).
   - `TrackingType.InQuest`: cong truc tiep `RequirementValue`.
5. Neu `CurrentValue < 0` => task bi `Failed`.
6. Neu du dieu kien => check complete task/quest qua `QuestManager`.

### 4.5 Khi task complete

`HandleCompleteTaskFlow()`:

- Check complete task hien tai.
- Neu co task tiep theo va dang `NotStarted` => set `InProgress` + setup task context.
- Voi task moi co requirement `TrackingType.Total`, he thong nap lai progress tu cache tong de co the complete ngay.

## 5) TrackingType

Dinh nghia trong `BaseQuestRecord.cs`:

- `Total`: tien do mang tinh tich luy toan cuc, doc tu cache.
- `InQuest`: tien do tinh tren su kien phat sinh trong qua trinh lam quest.

## 6) Requirement matcher (condition)

Interface: `ITrackingQuestRequirementMatcher`.

Hien tai co 3 matcher:

- `DefaultRequirementMatcher` (`Id = ""`): luon true.
- `CheckLevelItemMatcher` (`Id = "check_level_equal"`): `RequirementValue` phai bang gia tri condition.
- `CheckFtueEnableMatcher` (`Id = "check_ftue_enable"`): so voi `TutorialBlueprint.Current.EnableFTUE`.

`BaseTrackingQuestRequirementMatcher<T>` ho tro parse `RequirementConditionData` theo kieu primitive/JSON.

## 7) Consumer ngoai quest

Ngoai `TrackingQuestServices`, con 2 subscriber dung cung signal:

- `AnalyticServiceHandler`:
  - `BuildBuilding` / `UpgradeBuilding` => gui event `Building`.
  - `KillEnemy` => cong don `TotalMobKill` cho event exit area.
- `InitializeWorldEntitiesSystem`:
  - Nhan `OwnerItem` de danh dau trang thai `OwnerItemOnStart()`.

## 8) RequirementType dang duoc fire trong code

Thong ke hien tai tim thay 36 requirement type dang fire `TrackingQuestSignal`:

- `AssignJobForWorker`
- `BuildBuilding`
- `BuildTownCenter`
- `ClaimItemShard`
- `ClaimMiner`
- `CollectItem`
- `CompleteASideQuest`
- `CompleteDialog`
- `CompleteDungeon`
- `CompleteEventPoi`
- `DestroyTotem`
- `EarnCurrency`
- `EnterPlace`
- `EquipInventoryItem`
- `EquipWorkerOnMining`
- `FastForward`
- `KillEnemy`
- `LevelUpPlayer`
- `LocateArea`
- `OwnBuilding`
- `OwnerItem`
- `OwnWorker`
- `ProduceResource`
- `ProvideAssets`
- `ReRollWeaponModifier`
- `SalvageItem`
- `SaveWorker`
- `SpendCurrency`
- `StartMiningMiner`
- `UnlockZone`
- `UpgradeBackPack`
- `UpgradeBuilding`
- `UpgradeHero`
- `UpgradeItem`
- `UpgradeItemToLevel`
- `UpgradeTowerCenter`

## 9) Cach them tracking moi

1. Them constant requirement type moi trong `StaticValue.RequirementQuestStaticValue`.
2. Fire `TrackingQuestSignal` tai diem gameplay mong muon.
3. Khai bao requirement trong quest data (type/id/value/trackingType).
4. Neu can condition rieng, tao matcher moi implement `ITrackingQuestRequirementMatcher`.
5. Neu can analytics, them handling trong `AnalyticServiceHandler.OnTrackingQuestSignal`.
6. Chay test manual:
   - Trigger event gameplay.
   - Kiem tra progress task thay doi dung.
   - Kiem tra transition task tiep theo.
   - Kiem tra event analytics lien quan (neu co).

## 10) Luu y quan trong

- `RequirementIds` bi lap trong 1 signal se duoc cong lap (khong co dedupe).
- `RequirementIds` rong van tang tong theo key `string.Empty`.
- Queue tracking co do tre nho do flush theo batch (toi da 0.1s).
- Neu fire signal qua som (truoc khi service subscribe), event do se khong duoc xu ly lai.
