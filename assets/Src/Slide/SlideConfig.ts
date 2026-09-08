/**
 * Toàn bộ tuning của Slide Game nằm ở file này – đổi economy/pacing tại đây,
 * không rải hằng số vào component (cùng nguyên tắc với GameConfig.ts của game cũ).
 */
export const SLIDE_CONFIG = {
    // --- Economy ---
    /** Tiền ban đầu. Đủ để mua ngay lần upgrade Slide đầu tiên trong tutorial. */
    INITIAL_MONEY: 10,
    /** Tiền nhận được mỗi lần khách trượt qua cổng vòm. */
    EARN_PER_RIDE: 5,

    // --- Speed upgrade ---
    /** Thời gian trượt thẳng ở level đầu. */
    BASE_SLIDE_DURATION: 2,
    /** 10 cấp đưa thời gian về khoảng 0.84s nhưng mỗi lần mua vẫn cải thiện rõ. */
    SPEED_STEP: 0.88,
    SPEED_MAX_UPGRADES: 10,
    SPEED_UPGRADE_COST: 20,

    // --- Slide (số làn) upgrade ---
    /** Số làn lúc mới vào game. */
    BASE_LANE_COUNT: 1,
    /** Art chỉ có 10 làn (slide1..slide10 trong mỗi thư mục level) nên trần = 10 - BASE_LANE_COUNT. */
    LANE_MAX_UPGRADES: 9,
    LANE_UPGRADE_COST: 10,

    // --- Level upgrade ---
    /** Level lúc mới vào game. */
    BASE_SLIDE_LEVEL: 1,
    /**
     * 3 level, dùng CHUNG một bộ làn (node Slides) và chỉ đổi art:
     *   Lv1 – body + rail art level1, chưa có mái kính
     *   Lv2 – body + rail đổi sang art level2
     *   Lv3 – giữ art level2, bật thêm mái kính (Dome)
     * Art chỉ có 2 bộ ống (assets/Asset/slide/level1, level2) nên Lv3 dùng lại
     * bộ level2; xem bodyFramesByLevel/railFramesByLevel của SlideTrack.
     */
    LEVEL_MAX_UPGRADES: 2,
    LEVEL_UPGRADE_COST: 50,
    /** Từ level này trở lên thì bật mái kính của mỗi làn. */
    DOME_FROM_LEVEL: 3,

    // --- Pacing / UI ---
    /** Giây giữa 2 lần spawn bù khách vào hàng chờ. */
    CUSTOMER_SPAWN_INTERVAL: 0.35,
    /** Giây để khách đi hết 1 đoạn waypoint trong hàng chờ. */
    QUEUE_SEGMENT_DURATION: 0.25,
    /** Giây để khách từ đầu hàng leo lên platform. */
    CLIMB_DURATION: 0.45,
    /** Giây để khách rời cổng vòm ra khỏi màn hình (mỗi đoạn waypoint). */
    EXIT_SEGMENT_DURATION: 0.4,

    // --- Hồ bơi (sau khi qua cổng vòm) ---
    /** Giây khách trôi từ cổng vòm vào lòng hồ. Tính vào POOL_STAY_DURATION. */
    POOL_DRIFT_DURATION: 0.6,
    /** Tổng số giây khách ở trong hồ, tính từ lúc qua cổng vòm tới lúc bắt đầu mờ. */
    POOL_STAY_DURATION: 5,
    /** Giây mờ dần rồi biến mất (trả về pool object). */
    POOL_FADE_DURATION: 0.4,
    /**
     * Điểm khách trôi tới trong hồ = vị trí cổng vòm + hướng vào lòng hồ * độ sâu
     * ngẫu nhiên, cộng chút lệch dọc theo mặt nước.
     *
     * Hồ là hình chữ nhật xoay: mặt nước là cạnh trên-phải, dốc xuống phải với
     * độ dốc -0.14, và node Pool đã được đặt khớp hàng cổng vòm. Pháp tuyến
     * hướng vào lòng hồ của cạnh đó là (-0.14, -1) – tức xuống và hơi sang TRÁI.
     * Bám theo pháp tuyến này thì cả làn 0 (sát góc trên của hồ) lẫn làn 9 (sát
     * góc phải) đều rơi vào trong nước; lệch ngang phải giữ nhỏ vì hai làn đầu
     * cuối chỉ cách góc hồ ~12px và ~32px.
     */
    POOL_DRIFT_DIR_X: -0.14,
    POOL_DRIFT_DIR_Y: -1,
    POOL_DRIFT_DEPTH_MIN: 45,
    POOL_DRIFT_DEPTH_MAX: 100,
    /**
     * Lệch (+/-) dọc theo mặt nước, đơn vị px. Giữ <= 10: làn 9 chỉ cách góc
     * phải của hồ ~36px nên lệch to hơn sẽ đẩy khách ra ngoài mép nước.
     */
    POOL_DRIFT_SIDE_SPREAD: 8,
    /** Biên độ nhấp nhô lên/xuống khi khách nổi trong hồ (px) và giây mỗi nhịp. */
    POOL_BOB_AMPLITUDE: 7,
    POOL_BOB_DURATION: 0.9,
    /** Giây không tương tác → hiện hand pointer. */
    IDLE_HINT_INTERVAL: 5,
};

/**
 * State runtime bị mutate khi player upgrade. Customer đọc `slideDuration`
 * ngay tại thời điểm bắt đầu trượt → làn mở sau tự hưởng speed hiện tại
 * (cùng cơ chế với GAME_RUNTIME của game cũ).
 */
export const SLIDE_RUNTIME = {
    /** Số lần đã upgrade speed (0..SPEED_MAX_UPGRADES). */
    speedLevel: 0,
    /** Thời gian trượt hiện tại (giây). Đồng bộ với speedLevel. */
    slideDuration: SLIDE_CONFIG.BASE_SLIDE_DURATION,

    /** Số lần đã upgrade slide (0..LANE_MAX_UPGRADES). */
    laneUpgrades: 0,
    /** Số làn đang hoạt động = BASE_LANE_COUNT + laneUpgrades. */
    laneCount: SLIDE_CONFIG.BASE_LANE_COUNT,

    /** Số lần đã upgrade level (0..LEVEL_MAX_UPGRADES). */
    levelUpgrades: 0,
    /** Level hiện tại = BASE_SLIDE_LEVEL + levelUpgrades. */
    slideLevel: SLIDE_CONFIG.BASE_SLIDE_LEVEL,
};

/** Thời gian trượt ứng với 1 mốc speed bất kỳ. */
export function slideDurationForSpeedLevel(level: number): number {
    const clamped = Math.max(0, Math.min(level, SLIDE_CONFIG.SPEED_MAX_UPGRADES));
    return SLIDE_CONFIG.BASE_SLIDE_DURATION * Math.pow(SLIDE_CONFIG.SPEED_STEP, clamped);
}

/** Reset runtime về mặc định – gọi khi scene load để không giữ state cũ. */
export function resetSlideRuntime(): void {
    SLIDE_RUNTIME.speedLevel = 0;
    SLIDE_RUNTIME.slideDuration = SLIDE_CONFIG.BASE_SLIDE_DURATION;
    SLIDE_RUNTIME.laneUpgrades = 0;
    SLIDE_RUNTIME.laneCount = SLIDE_CONFIG.BASE_LANE_COUNT;
    SLIDE_RUNTIME.levelUpgrades = 0;
    SLIDE_RUNTIME.slideLevel = SLIDE_CONFIG.BASE_SLIDE_LEVEL;
}
