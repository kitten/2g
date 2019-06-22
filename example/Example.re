module TwoG = TwoG_Gfx;

let vs = {|
  #version 300 es

  in vec3 position;
  in vec4 color;
  out vec4 out_color;

  void main() {
    gl_Position = vec4(position.xyz, 1);
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

  TwoG.beginPass();
  TwoG.applyPipeline(program);
  TwoG.applyBuffers([|vertices, colors|]);
  TwoG.draw(0, 3, 1);
  TwoG.endPass();
  TwoG.commit();

  state
};

TwoG.start(~init, ~frame);
