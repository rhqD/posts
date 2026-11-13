// 3D 灯具 → 真实设备的绑定表。
//
//   entry: { device: "1000abc" }                      默认用 set_switch
//   desk:  { device: "1000def", action: "set_power" } 换一个开关动作
//
// 不在表内的灯保持纯前端动画，不会发出任何网络请求。
// 在表内但当前访客没有 control 权限的，同样退回动画。
//
// 这是页面侧的配置：服务端只知道设备，不知道「庭院灯」这种展示概念。
export type Binding = { device: string; action?: string };

export const DEVICE_MAP: Record<string, Binding> = {};
