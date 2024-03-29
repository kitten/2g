module TwoG = TwoG_Gfx;

let vs = {|
  #version 300 es

  in vec3 position;
  in vec3 color;

  uniform mat4 mat;

  out vec4 out_color;

  void main() {
    gl_Position = mat * vec4(position.xyz, 1.0);
    out_color = vec4(color.xyz, 1.0);
  }
|};

let fs = {|
  #version 300 es

  in vec4 out_color;
  out vec4 frag_color;

  void main() {
    frag_color = out_color;
  }
|};

let init = () => {
  let vertices = TwoG.vertexBufferOfArray([|
    // left column front
    0.0,   0.0,  0.0,
    0.0, 150.0,  0.0,
    30.0,   0.0,  0.0,
    0.0, 150.0,  0.0,
    30.0, 150.0,  0.0,
    30.0,   0.0,  0.0,

    // top rung front
    30.0,   0.0,  0.0,
    30.0,  30.0,  0.0,
    100.0,   0.0,  0.0,
    30.0,  30.0,  0.0,
    100.0,  30.0,  0.0,
    100.0,   0.0,  0.0,

    // middle rung front
    30.0,  60.0,  0.0,
    30.0,  90.0,  0.0,
    67.0,  60.0,  0.0,
    30.0,  90.0,  0.0,
    67.0,  90.0,  0.0,
    67.0,  60.0,  0.0,

    // left column back
      0.0,   0.0,  30.0,
      30.0,   0.0,  30.0,
      0.0, 150.0,  30.0,
      0.0, 150.0,  30.0,
      30.0,   0.0,  30.0,
      30.0, 150.0,  30.0,

    // top rung back
      30.0,   0.0,  30.0,
    100.0,   0.0,  30.0,
      30.0,  30.0,  30.0,
      30.0,  30.0,  30.0,
    100.0,   0.0,  30.0,
    100.0,  30.0,  30.0,

    // middle rung back
      30.0,  60.0,  30.0,
      67.0,  60.0,  30.0,
      30.0,  90.0,  30.0,
      30.0,  90.0,  30.0,
      67.0,  60.0,  30.0,
      67.0,  90.0,  30.0,

    // top
      0.0,   0.0,   0.0,
    100.0,   0.0,   0.0,
    100.0,   0.0,  30.0,
      0.0,   0.0,   0.0,
    100.0,   0.0,  30.0,
      0.0,   0.0,  30.0,

    // top rung right
    100.0,   0.0,   0.0,
    100.0,  30.0,   0.0,
    100.0,  30.0,  30.0,
    100.0,   0.0,   0.0,
    100.0,  30.0,  30.0,
    100.0,   0.0,  30.0,

    // under top rung
    30.0,   30.0,   0.0,
    30.0,   30.0,  30.0,
    100.0,  30.0,  30.0,
    30.0,   30.0,   0.0,
    100.0,  30.0,  30.0,
    100.0,  30.0,   0.0,

    // between top rung and middle
    30.0,   30.0,   0.0,
    30.0,   60.0,  30.0,
    30.0,   30.0,  30.0,
    30.0,   30.0,   0.0,
    30.0,   60.0,   0.0,
    30.0,   60.0,  30.0,

    // top of middle rung
    30.0,   60.0,   0.0,
    67.0,   60.0,  30.0,
    30.0,   60.0,  30.0,
    30.0,   60.0,   0.0,
    67.0,   60.0,   0.0,
    67.0,   60.0,  30.0,

    // right of middle rung
    67.0,   60.0,   0.0,
    67.0,   90.0,  30.0,
    67.0,   60.0,  30.0,
    67.0,   60.0,   0.0,
    67.0,   90.0,   0.0,
    67.0,   90.0,  30.0,

    // bottom of middle rung.
    30.0,   90.0,   0.0,
    30.0,   90.0,  30.0,
    67.0,   90.0,  30.0,
    30.0,   90.0,   0.0,
    67.0,   90.0,  30.0,
    67.0,   90.0,   0.0,

    // right of bottom
    30.0,   90.0,   0.0,
    30.0,  150.0,  30.0,
    30.0,   90.0,  30.0,
    30.0,   90.0,   0.0,
    30.0,  150.0,   0.0,
    30.0,  150.0,  30.0,

    // bottom
    0.0,   150.0,   0.0,
    0.0,   150.0,  30.0,
    30.0,  150.0,  30.0,
    0.0,   150.0,   0.0,
    30.0,  150.0,  30.0,
    30.0,  150.0,   0.0,

    // left side
    0.0,   0.0,   0.0,
    0.0,   0.0,  30.0,
    0.0, 150.0,  30.0,
    0.0,   0.0,   0.0,
    0.0, 150.0,  30.0,
    0.0, 150.0,   0.0,
  |]);

  let colors = TwoG.vertexBufferOfArray(Array.map(x => x /. 255.0, [|
    200.0,  70.0, 120.0,
    200.0,  70.0, 120.0,
    200.0,  70.0, 120.0,
    200.0,  70.0, 120.0,
    200.0,  70.0, 120.0,
    200.0,  70.0, 120.0,

      // top rung front
    200.0,  70.0, 120.0,
    200.0,  70.0, 120.0,
    200.0,  70.0, 120.0,
    200.0,  70.0, 120.0,
    200.0,  70.0, 120.0,
    200.0,  70.0, 120.0,

      // middle rung front
    200.0,  70.0, 120.0,
    200.0,  70.0, 120.0,
    200.0,  70.0, 120.0,
    200.0,  70.0, 120.0,
    200.0,  70.0, 120.0,
    200.0,  70.0, 120.0,

      // left column back
    80.0, 70.0, 200.0,
    80.0, 70.0, 200.0,
    80.0, 70.0, 200.0,
    80.0, 70.0, 200.0,
    80.0, 70.0, 200.0,
    80.0, 70.0, 200.0,

      // top rung back
    80.0, 70.0, 200.0,
    80.0, 70.0, 200.0,
    80.0, 70.0, 200.0,
    80.0, 70.0, 200.0,
    80.0, 70.0, 200.0,
    80.0, 70.0, 200.0,

      // middle rung back
    80.0, 70.0, 200.0,
    80.0, 70.0, 200.0,
    80.0, 70.0, 200.0,
    80.0, 70.0, 200.0,
    80.0, 70.0, 200.0,
    80.0, 70.0, 200.0,

      // top
    70.0, 200.0, 210.0,
    70.0, 200.0, 210.0,
    70.0, 200.0, 210.0,
    70.0, 200.0, 210.0,
    70.0, 200.0, 210.0,
    70.0, 200.0, 210.0,

      // top rung right
    200.0, 200.0, 70.0,
    200.0, 200.0, 70.0,
    200.0, 200.0, 70.0,
    200.0, 200.0, 70.0,
    200.0, 200.0, 70.0,
    200.0, 200.0, 70.0,

      // under top rung
    210.0, 100.0, 70.0,
    210.0, 100.0, 70.0,
    210.0, 100.0, 70.0,
    210.0, 100.0, 70.0,
    210.0, 100.0, 70.0,
    210.0, 100.0, 70.0,

      // between top rung and middle
    210.0, 160.0, 70.0,
    210.0, 160.0, 70.0,
    210.0, 160.0, 70.0,
    210.0, 160.0, 70.0,
    210.0, 160.0, 70.0,
    210.0, 160.0, 70.0,

      // top of middle rung
    70.0, 180.0, 210.0,
    70.0, 180.0, 210.0,
    70.0, 180.0, 210.0,
    70.0, 180.0, 210.0,
    70.0, 180.0, 210.0,
    70.0, 180.0, 210.0,

      // right of middle rung
    100.0, 70.0, 210.0,
    100.0, 70.0, 210.0,
    100.0, 70.0, 210.0,
    100.0, 70.0, 210.0,
    100.0, 70.0, 210.0,
    100.0, 70.0, 210.0,

      // bottom of middle rung.
    76.0, 210.0, 100.0,
    76.0, 210.0, 100.0,
    76.0, 210.0, 100.0,
    76.0, 210.0, 100.0,
    76.0, 210.0, 100.0,
    76.0, 210.0, 100.0,

      // right of bottom
    140.0, 210.0, 80.0,
    140.0, 210.0, 80.0,
    140.0, 210.0, 80.0,
    140.0, 210.0, 80.0,
    140.0, 210.0, 80.0,
    140.0, 210.0, 80.0,

      // bottom
    90.0, 130.0, 110.0,
    90.0, 130.0, 110.0,
    90.0, 130.0, 110.0,
    90.0, 130.0, 110.0,
    90.0, 130.0, 110.0,
    90.0, 130.0, 110.0,

      // left side
    160.0, 160.0, 220.0,
    160.0, 160.0, 220.0,
    160.0, 160.0, 220.0,
    160.0, 160.0, 220.0,
    160.0, 160.0, 220.0,
    160.0, 160.0, 220.0,
  |]));

  let start = TwoG.now();

  let program = TwoG.makeProgram(~vs, ~fs, [|
    DepthComparison(COMPARE_LESS),
    CullMode(CULL_BACK)
  |]);

  (vertices, colors, program)
};

let frame = (state) => {
  let (vertices, colors, program) = state;

  let clearColor = Vec4.make(0.7, 0.7, 0.7, 1.0);

  let projection = Mat4.perspective(60.0, 16.0 /. 9.0, 1.0, 2000.0);

  let x = mod_float(TwoG.now(), 2000.0) /. 1000.0;
  let x = x >= 1.0 ? 1.0 -. (x -. 1.0): x;

  let view = Mat4.lookAt(
    Vec3.make(75.0 +. x *. 100.0, 0.0, -360.0),
    Vec3.make(80.0, 80.0, 110.0),
    Vec3.make(0.0, -1.0, 0.0)
  );

  let matrix = Mat4.multiply(projection, view);

  TwoG.beginPass(~clearColor, ());
  TwoG.applyPipeline(program);
  TwoG.applyBuffers([|vertices, colors|]);
  TwoG.applyVertexUniforms([|Mat4(matrix)|]);

  TwoG.draw(0, 16 * 6, 1);
  TwoG.endPass();
  TwoG.commit();

  state
};

TwoG.start(~init, ~frame);
