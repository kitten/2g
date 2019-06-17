let vs = {|#version 330
  layout(location=0) in vec4 in_position;
  layout(location=1) in vec4 in_color;
  out vec4 color;

  void main() {
    gl_Position = in_position;
    color = in_color;
  }
|};

let fs = {|#version 330
  in vec4 color;
  out vec4 frag_color;

  void main() {
    frag_color = color;
  }
|};

let toBuffer = arr =>
  Bigarray.Array1.of_array(Float32, C_layout, arr);

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

TwoG.start(~init, ~frame);
