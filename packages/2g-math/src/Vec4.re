type t = { x: float, y: float, z: float, w: float };

let make = (x: float, y: float, z: float, w: float) =>
  { x, y, z, w };

let add = (a: t, b: t): t => {
  x: a.x +. b.x,
  y: a.y +. b.y,
  z: a.z +. b.z,
  w: a.w +. b.w,
};

let subtract = (a: t, b: t): t => {
  x: a.x -. b.x,
  y: a.y -. b.y,
  z: a.z -. b.z,
  w: a.w -. b.w,
};

let multiply = (a: t, b: t): t => {
  x: a.x *. b.x,
  y: a.y *. b.y,
  z: a.z *. b.z,
  w: a.w *. b.w,
};

let divide = (a: t, b: t): t => {
  x: a.x /. b.x,
  y: a.y /. b.y,
  z: a.z /. b.z,
  w: a.w /. b.w,
};

let dot = (a: t, b: t): float =>
  a.x *. b.x +. a.y *. b.y +. a.z *. b.z +. a.w *. b.w;

let length = (v: t): float =>
  sqrt(dot(v, v));

let normalize = (v: t): t => {
  let l = length(v);
  if (l == 0.0) {
    { x: 0.0, y: 0.0, z: 0.0, w: 0.0 }
  } else {
    {
      x: v.x *. (1.0 /. l),
      y: v.y *. (1.0 /. l),
      z: v.z *. (1.0 /. l),
      w: v.w *. (1.0 /. l),
    }
  }
};

let equals = (a: t, b: t): bool =>
  a.x == b.x && a.y == b.y && a.z == b.z && a.w == b.w;
