let vs = {|#version 330
  layout(location=0) in vec4 position;
  layout(location=1) in vec4 color0;
  out vec4 color;

  void main() {
    gl_Position = position;
    color = vec4(1, 1, 1, 1);
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

let vertices = toBuffer([|
  0.0,  0.5, 0.5, 1.0, 0.0, 0.0, 1.0,
  0.5, -0.5, 0.5, 0.0, 1.0, 0.0, 1.0,
  -0.5, -0.5, 0.5, 0.0, 0.0, 1.0, 1.0
|]);

let bindingsRef = ref(None);
let pipelineRef = ref(None);

let frame = () => {
  let bindings = switch (bindingsRef^) {
  | None => {
    let buffer = TwoG.makeBuffer(vertices);
    let bindings = TwoG.makeBindings(buffer);
    bindingsRef := Some(bindings);
    bindings
  }
  | Some(bindings) => bindings
  };

  let pipeline = switch (pipelineRef^) {
  | None => {
    let shader = TwoG.makeShader(~vs, ~fs);
    let pipeline = TwoG.makePipeline(shader);
    pipelineRef := Some(pipeline);
    pipeline
  }
  | Some(pipeline) => pipeline
  };

  TwoG.beginPass();
  TwoG.applyPipeline(pipeline);
  TwoG.applyBindings(bindings);
  TwoG.draw(0, 3, 1);
  TwoG.endPass();
  TwoG.commit();
};

TwoG.start(~frame, ());
