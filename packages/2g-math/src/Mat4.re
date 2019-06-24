type t = array(float);

let make = () => [|
  0.0, 0.0, 0.0, 0.0,
  0.0, 0.0, 0.0, 0.0,
  0.0, 0.0, 0.0, 0.0,
  0.0, 0.0, 0.0, 0.0,
|];

let makeIdentity = (x: float) => [|
  x, x, x, x,
  x, x, x, x,
  x, x, x, x,
  x, x, x, x,
|];

let makeDiagonal = (x: float) => [|
  x, 0.0, 0.0, 0.0,
  0.0, x, 0.0, 0.0,
  0.0, 0.0, x, 0.0,
  0.0, 0.0, 0.0, x,
|];

let perspective = (fov: float, aspect: float, near: float, far: float) => {
  let res = make();
  let f = tan(Math.pi /. 2.0 -. Math.radOfDeg(fov) /. 2.0);
  let r = 1.0 /. (near -. far);
  res[0] = f /. aspect;
  res[5] = f;
  res[10] = (near +. far) *. r;
  res[11] = -1.0;
  res[14] = near *. far *. r *. 2.0;
  res
};

let lookAt = (eye: Vec3.t, center: Vec3.t, up: Vec3.t) => {
  let res = make();
  let f = Vec3.normalize(Vec3.subtract(center, eye));
  let s = Vec3.normalize(Vec3.cross(f, up));
  let u = Vec3.cross(s, f);

  res[0] = s.x;
  res[1] = u.x;
  res[2] = -1.0 *. f.x;
  res[4] = s.y;
  res[5] = u.y;
  res[6] = -1.0 *. f.y;
  res[8] = s.z;
  res[9] = u.z;
  res[10] = -1.0 *. f.z;
  res[12] = -1.0 *. Vec3.dot(s, eye);
  res[13] = -1.0 *. Vec3.dot(u, eye);
  res[14] = Vec3.dot(f, eye);
  res[15] = 1.0;
  res
};

let scale = (vec: Vec3.t) => {
  let res = makeDiagonal(1.0);
  res[0] = vec.x;
  res[5] = vec.y;
  res[10] = vec.z;
  res
};

let translate = (vec: Vec3.t) => {
  let res = makeDiagonal(1.0);
  res[12] = vec.x;
  res[13] = vec.y;
  res[14] = vec.z;
  res
};

let rotate = (deg: float, vec: Vec3.t) => {
  let res = makeDiagonal(1.0);
  let axis = Vec3.normalize(vec);
  let angle = Math.radOfDeg(deg);
  let sinTheta = sin(angle);
  let cosTheta = cos(angle);
  let cosValue = 1.0 -. cosTheta;

  res[0] = axis.x *. axis.x *. cosValue +. cosTheta;
  res[1] = axis.x *. axis.y *. cosValue +. axis.z *. sinTheta;
  res[2] = axis.x *. axis.z *. cosValue -. axis.y *. sinTheta;

  res[4] = axis.y *. axis.x *. cosValue -. axis.z *. sinTheta;
  res[5] = axis.y *. axis.y *. cosValue +. cosTheta;
  res[6] = axis.y *. axis.z *. cosValue +. axis.x *. sinTheta;

  res[8] = axis.z *. axis.x *. cosValue +. axis.y *. sinTheta;
  res[9] = axis.z *. axis.y *. cosValue -. axis.x *. sinTheta;
  res[10] = axis.z *. axis.z *. cosValue +. cosTheta;
  res
};

let add = (a: t, b: t) => [|
  a[0] +. b[0], a[1] +. b[1], a[2] +. b[2], a[3] +. b[3],
  a[4] +. b[4], a[5] +. b[5], a[6] +. b[6], a[7] +. b[7],
  a[8] +. b[8], a[9] +. b[9], a[10] +. b[10], a[11] +. b[11],
  a[12] +. b[12], a[13] +. b[13], a[14] +. b[14], a[15] +. b[15],
|];

let subtract = (a: t, b: t) => [|
  a[0] -. b[0], a[1] -. b[1], a[2] -. b[2], a[3] -. b[3],
  a[4] -. b[4], a[5] -. b[5], a[6] -. b[6], a[7] -. b[7],
  a[8] -. b[8], a[9] -. b[9], a[10] -. b[10], a[11] -. b[11],
  a[12] -. b[12], a[13] -. b[13], a[14] -. b[14], a[15] -. b[15],
|];

let multiply = (a: t, b: t) => [|
  a[0] *. b[0] +. a[4] *. b[1] +. a[8] *. b[2] +. a[12] *. b[3],
  a[1] *. b[0] +. a[5] *. b[1] +. a[9] *. b[2] +. a[13] *. b[3],
  a[2] *. b[0] +. a[6] *. b[1] +. a[10] *. b[2] +. a[14] *. b[3],
  a[3] *. b[0] +. a[7] *. b[1] +. a[11] *. b[2] +. a[15] *. b[3],
  a[0] *. b[4] +. a[4] *. b[5] +. a[8] *. b[6] +. a[12] *. b[7],
  a[1] *. b[4] +. a[5] *. b[5] +. a[9] *. b[6] +. a[13] *. b[7],
  a[2] *. b[4] +. a[6] *. b[5] +. a[10] *. b[6] +. a[14] *. b[7],
  a[3] *. b[4] +. a[7] *. b[5] +. a[11] *. b[6] +. a[15] *. b[7],
  a[0] *. b[8] +. a[4] *. b[9] +. a[8] *. b[10] +. a[12] *. b[11],
  a[1] *. b[8] +. a[5] *. b[9] +. a[9] *. b[10] +. a[13] *. b[11],
  a[2] *. b[8] +. a[6] *. b[9] +. a[10] *. b[10] +. a[14] *. b[11],
  a[3] *. b[8] +. a[7] *. b[9] +. a[11] *. b[10] +. a[15] *. b[11],
  a[0] *. b[12] +. a[4] *. b[13] +. a[8] *. b[14] +. a[12] *. b[15],
  a[1] *. b[12] +. a[5] *. b[13] +. a[9] *. b[14] +. a[13] *. b[15],
  a[2] *. b[12] +. a[6] *. b[13] +. a[10] *. b[14] +. a[14] *. b[15],
  a[3] *. b[12] +. a[7] *. b[13] +. a[11] *. b[14] +. a[15] *. b[15],
|];

let invert = (mat: t) => {
  let b00 = mat[0] *. mat[5] -. mat[1] *. mat[4];
  let b01 = mat[0] *. mat[6] -. mat[2] *. mat[4];
  let b02 = mat[0] *. mat[7] -. mat[3] *. mat[4];
  let b03 = mat[1] *. mat[6] -. mat[2] *. mat[5];
  let b04 = mat[1] *. mat[7] -. mat[3] *. mat[5];
  let b05 = mat[1] *. mat[7] -. mat[3] *. mat[6];
  let b06 = mat[8] *. mat[13] -. mat[9] *. mat[12];
  let b07 = mat[8] *. mat[14] -. mat[10] *. mat[12];
  let b08 = mat[8] *. mat[15] -. mat[11] *. mat[12];
  let b09 = mat[9] *. mat[14] -. mat[10] *. mat[13];
  let b10 = mat[9] *. mat[15] -. mat[11] *. mat[13];
  let b11 = mat[10] *. mat[15] -. mat[11] *. mat[14];

  let det = b00 *. b11 -. b01 *. b10 +. b02 *. b09 +. b03 *. b08 -. b04 *. b07 +. b05 *. b06;
  let det = 1.0 /. det;

  [|
    (mat[5] *. b11 -. mat[6] *. b10 +. mat[7] *. b09) *. det,
    (mat[2] *. b10 -. mat[1] *. b11 -. mat[3] *. b09) *. det,
    (mat[13] *. b05 -. mat[14] *. b04 +. mat[15] *. b03) *. det,
    (mat[10] *. b04 -. mat[9] *. b05 -. mat[11] *. b03) *. det,
    (mat[6] *. b08 -. mat[4] *. b11 -. mat[7] *. b07) *. det,
    (mat[0] *. b11 -. mat[2] *. b08 +. mat[3] *. b07) *. det,
    (mat[14] *. b02 -. mat[12] *. b05 -. mat[15] *. b01) *. det,
    (mat[8] *. b05 -. mat[10] *. b02 +. mat[11] *. b01) *. det,
    (mat[4] *. b10 -. mat[5] *. b08 +. mat[7] *. b06) *. det,
    (mat[1] *. b08 -. mat[0] *. b10 -. mat[3] *. b06) *. det,
    (mat[12] *. b04 -. mat[13] *. b02 +. mat[15] *. b00) *. det,
    (mat[9] *. b02 -. mat[8] *. b04 -. mat[11] *. b00) *. det,
    (mat[5] *. b07 -. mat[4] *. b09 -. mat[6] *. b06) *. det,
    (mat[0] *. b09 -. mat[1] *. b07 +. mat[2] *. b06) *. det,
    (mat[13] *. b01 -. mat[12] *. b03 -. mat[14] *. b00) *. det,
    (mat[8] *. b03 -. mat[9] *. b01 +. mat[10] *. b00) *. det,
  |]
};
