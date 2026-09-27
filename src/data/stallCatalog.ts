import type { StallInfo } from '../types';

export const STALL_CATALOG: Record<string, StallInfo> = {
  'Quán Cơm': {
    name: 'Quán Cơm',
    emoji: '🍚',
    location: 'Dãy A, Sạp 3',
    products: [
      { name: 'Suất cơm trưa đặc biệt', price: 50000 },
      { name: 'Cơm tấm sườn bì', price: 45000 },
      { name: 'Nước mía tươi', price: 15000 },
      { name: 'Chè đậu xanh', price: 20000 },
      { name: 'Cơm gà xối mỡ', price: 55000 },
    ]
  },
  'Sạp Thịt': {
    name: 'Sạp Thịt',
    emoji: '🥩',
    location: 'Dãy B, Sạp 1',
    products: [
      { name: 'Thịt heo ba chỉ 1kg', price: 120000 },
      { name: 'Thịt bò tươi 1kg', price: 280000 },
      { name: 'Xương heo 1kg', price: 80000 },
      { name: 'Sườn non 1kg', price: 150000 },
    ]
  },
  'Sạp Rau': {
    name: 'Sạp Rau',
    emoji: '🥬',
    location: 'Dãy B, Sạp 7',
    products: [
      { name: 'Rau muống 1 bó', price: 10000 },
      { name: 'Cà chua 1kg', price: 25000 },
      { name: 'Bắp cải 1 cây', price: 30000 },
      { name: 'Hành lá 1 bó', price: 8000 },
      { name: 'Riềng + sả + ớt combo', price: 15000 },
    ]
  },
  'Quầy Bún': {
    name: 'Quầy Bún',
    emoji: '🍜',
    location: 'Dãy A, Sạp 8',
    products: [
      { name: 'Bún bò Huế', price: 45000 },
      { name: 'Bánh canh cua', price: 40000 },
      { name: 'Bún riêu', price: 35000 },
      { name: 'Bún chả', price: 50000 },
    ]
  },
  'Sạp Cá': {
    name: 'Sạp Cá',
    emoji: '🐟',
    location: 'Dãy C, Sạp 2',
    products: [
      { name: 'Cá chép tươi 1kg', price: 90000 },
      { name: 'Cá rô phi 1kg', price: 60000 },
      { name: 'Cá hú 1kg', price: 75000 },
      { name: 'Tôm sú 1kg', price: 250000 },
    ]
  },
  'Quầy Đá': {
    name: 'Quầy Đá',
    emoji: '🧊',
    location: 'Dãy D, Sạp 1',
    products: [
      { name: 'Bao đá viên 5kg', price: 30000 },
      { name: 'Đá xay ly lớn', price: 10000 },
      { name: 'Đá cây 10kg', price: 20000 },
    ]
  },
  'Đại Lý Gas': {
    name: 'Đại Lý Gas',
    emoji: '🔥',
    location: 'Đầu chợ',
    products: [
      { name: 'Bình gas 12kg', price: 430000 },
      { name: 'Bình gas mini 6kg', price: 230000 },
      { name: 'Bếp gas đơn', price: 350000 },
    ]
  },
  'Tiệm Sửa Máy': {
    name: 'Tiệm Sửa Máy',
    emoji: '🔧',
    location: 'Dãy D, Sạp 5',
    products: [
      { name: 'Sửa quạt điện', price: 80000 },
      { name: 'Thay motor máy xay', price: 200000 },
      { name: 'Sửa tủ lạnh', price: 300000 },
    ]
  },
  'C.H Vật Tư': {
    name: 'C.H Vật Tư',
    emoji: '🏗️',
    location: 'Dãy D, Sạp 8',
    products: [
      { name: 'Bóng đèn LED', price: 25000 },
      { name: 'Ổ điện đa năng', price: 45000 },
      { name: 'Dây điện 10m', price: 60000 },
    ]
  },
  'Tiệm In': {
    name: 'Tiệm In',
    emoji: '🖨️',
    location: 'Dãy A, Sạp 12',
    products: [
      { name: 'In menu A4 (100 tờ)', price: 150000 },
      { name: 'In hóa đơn (cuộn)', price: 35000 },
      { name: 'In danh thiếp (hộp)', price: 80000 },
    ]
  }
};
