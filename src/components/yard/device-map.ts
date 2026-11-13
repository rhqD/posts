// 3D 场景对象 → 真实设备的绑定表。
//
//   floodlight: { device: "1001e500e6", outlet: 0 }              灯，默认 type=light
//   entry:      { device: "1000abc" }
//   curtain:    { device: "1000xyz", type: "cover" }             以后加类型
//
// 不在表内的对象保持纯前端动画，不会发出任何网络请求。
// 在表内但当前访客没有 control 权限的，同样退回动画。
//
// type 决定场景里用哪个渲染器消费 state，默认 light。
export type Binding = { device: string; action?: string; outlet?: number; type?: string };

export const DEVICE_MAP: Record<string, Binding> = {
  // 西墙投光灯：CK-BL602-4SW-HS，4 路模块但只接了第 0 路
  floodlight: { device: "1001e500e6", outlet: 0 },
};
