type t = { x: float, y: float, z: float };

let make = (x: float, y: float, z: float) => { x, y, z };

let add = (a: t, b: t): t => {
  x: a.x +. b.x,
  y: a.y +. b.y,
  z: a.z +. b.z,
};

let subtract = (a: t, b: t): t => {
  x: a.x -. b.x,
  y: a.y -. b.y,
  z: a.z -. b.z,
};

let multiply = (a: t, b: t): t => {
  x: a.x *. b.x,
  y: a.y *. b.y,
  z: a.z *. b.z,
};

let divide = (a: t, b: t): t => {
  x: a.x /. b.x,
  y: a.y /. b.y,
  z: a.z /. b.z,
};

let cross = (a: t, b: t): t => {
  x: a.y *. b.z -. a.z *. b.y,
  y: a.z *. b.x -. a.x *. b.z,
  z: a.x *. b.y -. a.y *. b.x,
};

let dot = (a: t, b: t): float =>
  a.x *. b.x +. a.y *. b.y +. a.z *. b.z;

let length = (v: t): float =>
  sqrt(dot(v, v));

let normalize = (v: t): t => {
  let l = length(v);
  l == 0.0
    ? { x: 0.0, y: 0.0, z: 0.0 }
    : { x: v.x *. (1.0 /. l), y: v.y *. (1.0 /. l), z: v.z *. (1.0 /. l) }
};

let equals = (a: t, b: t): bool =>
  a.x == b.x && a.y == b.y && a.z == b.z;
