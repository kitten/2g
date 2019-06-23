module TwoG = TwoG_Gfx;

let vs = {|
  #version 300 es

  in vec3 position;
  in vec4 color;

  uniform mat4 mat;

  out vec4 out_color;

  void main() {
    gl_Position = mat * vec4(position.xyz, 1.0);
    out_color = color;
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
    0.0, 0.5, 0.5,
    0.5, -0.5, 0.5,
    -0.5, -0.5, 0.5,
  |]);

  let colors = TwoG.vertexBufferOfArray([|
    1.0, 0.0, 0.0, 1.0,
    0.0, 1.0, 0.0, 1.0,
    0.0, 0.0, 1.0, 1.0
  |]);

  let program = TwoG.makeProgram(~vs, ~fs, ());

  (vertices, colors, program)
};

let frame = (state) => {
  let (vertices, colors, program) = state;

  let red = mod_float(TwoG.now(), 2000.0) /. 1000.0;
  let red = red >= 1.0 ? 1.0 -. (red -. 1.0): red;
  let clearColor = (red, 0.4, 0.4, 1.0);

  TwoG.beginPass(~clearColor, ());
  TwoG.applyPipeline(program);
  TwoG.applyBuffers([|vertices, colors|]);

  TwoG.applyVertexUniforms([|
    Mat4(Mat4.scale(Vec3.make(2.0, 1.0, 1.0)))
  |]);

  TwoG.draw(0, 3, 1);
  TwoG.endPass();
  TwoG.commit();

  state
};

TwoG.start(~init, ~frame);
