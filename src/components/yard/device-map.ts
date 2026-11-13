// 3D 灯具 → 真实设备的绑定表。
//
//   floodlight: { device: "1001e500e6", outlet: 0 }    多路模块要指定通道
//   entry:      { device: "1000abc" }                  单路设备默认 set_switch
//
// 不在表内的灯保持纯前端动画，不会发出任何网络请求。
// 在表内但当前访客没有 control 权限的，同样退回动画。
//
// 这是页面侧的配置：服务端只知道设备，不知道「庭院灯」这种展示概念。
export type Binding = { device: string; action?: string; outlet?: number };

export const DEVICE_MAP: Record<string, Binding> = {
  // 西墙投光灯：CK-BL602-4SW-HS，4 路模块但只接了第 0 路
  floodlight: { device: "1001e500e6", outlet: 0 },
};
