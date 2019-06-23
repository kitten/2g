type t = { x: float, y: float };

let make = (x: float, y: float) => { x, y };

let add = (a: t, b: t): t => {
  x: a.x +. b.x,
  y: a.y +. b.y
};

let subtract = (a: t, b: t): t => {
  x: a.x -. b.x,
  y: a.y -. b.y
};

let multiply = (a: t, b: t): t => {
  x: a.x *. b.x,
  y: a.y *. b.y
};

let divide = (a: t, b: t): t => {
  x: a.x /. b.x,
  y: a.y /. b.y
};

let dot = (a: t, b: t): float =>
  a.x *. b.x +. a.y *. b.y;

let length = (v: t): float =>
  sqrt(dot(v, v));

let normalize = (v: t): t => {
  let l = length(v);
  l == 0.0
    ? { x: 0.0, y: 0.0 }
    : { x: v.x *. (1.0 /. l), y: v.y *. (1.0 /. l) }
};

let equals = (a: t, b: t): bool =>
  a.x == b.x && a.y == b.y;
