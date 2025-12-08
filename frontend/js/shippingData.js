// frontend/js/shippingData.js (V10 - 資料庫驅動備案版 + New Statuses)
// 此檔案提供全站共用的常數與預設資料。
// 注意：RATES, CONSTANTS, REMOTE_AREAS 設為可變變數 (var/window)，
// 允許 main.js 或 admin.js 在載入後透過 API 從資料庫拉取最新設定並覆蓋。

// --- 1. 基礎運費與計算常數 (預設值) ---
var RATES = {
  general: { name: "一般家具", weightRate: 22, volumeRate: 125 },
  special_a: { name: "特殊家具A", weightRate: 32, volumeRate: 184 },
  special_b: { name: "特殊家具B", weightRate: 40, volumeRate: 224 },
  special_c: { name: "特殊家具C", weightRate: 50, volumeRate: 274 },
};

// --- 2. 計算係數與門檻 (預設值) ---
var VOLUME_DIVISOR = 28317; // 材積換算除數
var CBM_TO_CAI_FACTOR = 35.3; // CBM 換算材積係數
var MINIMUM_CHARGE = 2000; // 最低消費
var OVERSIZED_LIMIT = 300; // 超長限制 (cm)
var OVERSIZED_FEE = 800; // 超長費
var OVERWEIGHT_LIMIT = 100; // 超重限制 (kg)
var OVERWEIGHT_FEE = 800; // 超重費

// 為了方便程式存取，我們也建立一個 CONSTANTS 物件 (模擬後端結構)
var CONSTANTS = {
  VOLUME_DIVISOR,
  CBM_TO_CAI_FACTOR,
  MINIMUM_CHARGE,
  OVERSIZED_LIMIT,
  OVERSIZED_FEE,
  OVERWEIGHT_LIMIT,
  OVERWEIGHT_FEE,
};

// --- 3. 狀態對照表 (UI顯示用 - 靜態邏輯) ---
const PACKAGE_STATUS_MAP = {
  PENDING: "待確認",
  ARRIVED: "已入庫",
  IN_SHIPMENT: "集運中",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

const SHIPMENT_STATUS_MAP = {
  PENDING_PAYMENT: "待付款",
  PENDING_REVIEW: "已付款(待審核)",
  PROCESSING: "已收款，安排裝櫃",
  SHIPPED: "已裝櫃",

  // [New] 新增詳細物流狀態
  CUSTOMS_CHECK: "海關查驗中",
  UNSTUFFING: "拆櫃派送中",

  // [New] 退回狀態
  RETURNED: "訂單被退回",

  COMPLETED: "已完成",
  CANCELLEDD: "清關放行", // (相容舊資料)
  CANCELL: "拆櫃派送", // (相容舊資料)
  CANCEL: "已完成", // (相容舊資料)
  CANCELLED: "已取消",
};

// --- 4. 狀態顏色對照 (Badge Class - 靜態邏輯) ---
const STATUS_CLASSES = {
  // 包裹
  PENDING: "status-PENDING",
  ARRIVED: "status-ARRIVED",
  IN_SHIPMENT: "status-IN_SHIPMENT",
  // 集運單
  PENDING_PAYMENT: "status-PENDING_PAYMENT",
  PENDING_REVIEW: "status-PENDING_REVIEW",
  PROCESSING: "status-PROCESSING",
  SHIPPED: "status-SHIPPED",

  // [New] 新增狀態顏色
  CUSTOMS_CHECK: "status-PENDING", // 使用黃色系提示查驗
  UNSTUFFING: "status-IN_SHIPMENT", // 使用藍色系
  RETURNED: "status-CANCELLED", // 使用紅色系

  // 共用
  COMPLETED: "status-COMPLETED",
  CANCEL: "status-COMPLETED",
  CANCELLED: "status-CANCELLED",
  // 舊相容
  CANCELLEDD: "status-IN_SHIPMENT",
  CANCELL: "status-IN_SHIPMENT",
};

// --- 5. 偏遠地區資料庫 (預設值) ---
// 若 API 尚未載入，將使用此列表
var REMOTE_AREAS = {
  1800: [
    "東勢區",
    "新社區",
    "石岡區",
    "和平區",
    "大雪山",
    "穀關",
    "水里鄉",
    "伸港鄉",
    "線西鄉",
    "秀水鄉",
    "芬園鄉",
    "芳苑鄉",
    "大村鄉",
    "大城鄉",
    "竹塘鄉",
    "北斗鎮",
    "溪州鄉",
  ],
  2000: [
    "三芝",
    "石門",
    "烏來",
    "坪林",
    "石碇區",
    "深坑區",
    "萬里",
    "平溪",
    "雙溪",
    "福隆",
    "貢寮",
    "三峽區",
    "淡水竹圍",
    "復興鄉",
    "新埔鎮",
    "關西鎮",
    "橫山鄉",
    "北埔鄉",
    "尖石鄉",
    "五峰鄉",
    "寶山鎮",
    "香山區",
    "造橋鎮",
    "峨嵋鄉",
    "三灣鄉",
    "芎林鄉",
    "頭屋鄉",
    "銅鑼鄉",
    "三義鄉",
    "通霄鎮",
    "苑裡鎮",
    "大湖鄉",
    "卓蘭鎮",
    "泰安鄉",
    "公館鄉",
    "竹南鎮",
  ],
  2500: [
    "名間鄉",
    "四湖鄉",
    "東勢鄉",
    "台西鄉",
    "古坑鄉",
    "口湖鄉",
    "崙背鄉",
    "麥寮鄉",
    "東石鄉",
    "六腳鄉",
    "竹崎鄉",
    "白河區",
    "東山區",
    "大內區",
    "玉井區",
    "山上區",
    "龍崎區",
    "後壁區",
    "左鎮區",
    "燕巢",
    "內門區",
    "大樹",
    "茄萣",
    "林園",
    "旗津",
    "杉林",
    "美濃",
    "永安",
    "阿蓮",
    "田寮",
    "旗山",
  ],
  3000: ["布袋鎮", "北門區", "將軍區", "七股區", "楠西區", "南化區"],
  4000: [
    "南莊鄉",
    "獅潭鄉",
    "竹山鎮",
    "鹿谷鄉",
    "集集鎮",
    "中寮鄉",
    "國姓鄉",
    "仁愛鄉",
    "信義鄉",
    "梨山",
    "奧萬大",
    "埔里",
  ],
  4500: [
    "陽明山",
    "金山",
    "魚池鄉",
    "那瑪夏區",
    "桃源區",
    "茂林",
    "甲仙",
    "六龜",
    "屏東縣全區",
    "宜蘭其他地區",
    "花蓮全區",
    "台東全區",
  ],
  5000: ["阿里山", "梅山鄉", "番路", "中埔鄉", "大埔鄉"],
  7000: [
    "小琉球",
    "琉球鄉",
    "恆春",
    "墾丁",
    "鵝鑾鼻",
    "車城",
    "滿洲",
    "牡丹",
    "獅子",
    "枋山",
    "春日",
    "枋寮",
    "佳冬",
    "來義",
    "泰武",
    "瑪家",
    "霧臺",
    "三地門",
    "南澳",
    "釣魚臺",
  ],
};

// 確保全域存取 (讓 main.js 或 admin.js 可以覆蓋)
window.RATES = RATES;
window.CONSTANTS = CONSTANTS;
window.REMOTE_AREAS = REMOTE_AREAS;
window.PACKAGE_STATUS_MAP = PACKAGE_STATUS_MAP;
window.SHIPMENT_STATUS_MAP = SHIPMENT_STATUS_MAP;
window.STATUS_CLASSES = STATUS_CLASSES;
