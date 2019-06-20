let vs = {|
  #version 300 es

  in vec4 position;
  in vec4 color;
  out vec4 out_color;

  void main() {
    gl_Position = position;
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

let toBuffer = arr =>
  Bigarray.Array1.of_array(Float32, C_layout, arr);

let init = () => {
  let vertices = toBuffer([|
    0.0, 0.5, 0.5, 1.0, 0.0, 0.0, 1.0,
    0.5, -0.5, 0.5, 0.0, 1.0, 0.0, 1.0,
    -0.5, -0.5, 0.5, 0.0, 0.0, 1.0, 1.0
  |]);

  let buffer = TwoG.makeBuffer(vertices);
  let bindings = TwoG.makeBindings(buffer);
  let shader = TwoG.makeShader(~vs, ~fs);
  let pipeline = TwoG.makePipeline(shader);

  (bindings, pipeline)
};

let frame = (state) => {
  let (bindings, pipeline) = state;

  TwoG.beginPass();
  TwoG.applyPipeline(pipeline);
  TwoG.applyBindings(bindings);
  TwoG.draw(0, 3, 1);
  TwoG.endPass();
  TwoG.commit();

  state
};

TwoG.start(~init, ~frame);
