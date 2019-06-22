exception UnknownAttrFormat;

/* sg_vertex_format */
type vertexFormat =
  | Invalid
  | Float
  | Float2
  | Float3
  | Float4
  | Byte4
  | Byte4N
  | UByte4
  | UByte4N
  | Short2
  | Short2N
  | Short4
  | Short4N
  | UInt10N2
  | Num
  | ForceU32;

type bufferDescT = Bigarray.Array1.t(float, Bigarray.float32_elt, Bigarray.c_layout);
type bufferT;
type shaderT;
type pipelineT;
type bindingsT;

module Internals = {
  [@noalloc] external start: unit => unit = "tg_start";

  external makeBuffer: bufferDescT => bufferT = "tg_make_buffer";
  external makeShader: (string, string, array(string)) => shaderT = "tg_make_shader";
  external makePipeline: (shaderT, array(vertexFormat)) => pipelineT = "tg_make_pipeline";
  external makeBindings: bufferT => bindingsT = "tg_make_bindings";

  external applyPipeline: pipelineT => unit = "tg_apply_pipeline";
  external applyBindings: bindingsT => unit = "tg_apply_bindings";
  external applyVertexBuffer: bufferT => unit = "tg_apply_vertex_buffer";

  [@noalloc] external beginPass: unit => unit = "tg_begin_pass";
  [@noalloc] external draw: (int, int, int) => unit = "tg_draw";
  [@noalloc] external endPass: unit => unit = "tg_end_pass";
  [@noalloc] external commit: unit => unit = "tg_commit";

  let getInputName = (input: GlslOptimizer.shaderDescT) =>
    input.name;

  let toAttrFormat = (input: GlslOptimizer.shaderDescT) => {
    switch (input.basicType, input.vectorSize) {
    | (Float, 1) => Float
    | (Float, 2) => Float2
    | (Float, 3) => Float3
    | (Float, 4) => Float4
    | _ => raise(UnknownAttrFormat)
    };
  }
};

let start = (~init: unit => 't, ~frame: 't => 't) => {
  Callback.register("tg_init_cb", init);
  Callback.register("tg_frame_cb", frame);
  Internals.start();
};

let makeProgram = (~vs, ~fs) => {
  let vertex = GlslOptimizer.convertShader(Vertex, vs);
  let fragment = GlslOptimizer.convertShader(Fragment, fs);
  let inputSize = GlslOptimizer.getInputLength(vertex);
  let inputs = Array.init(inputSize, GlslOptimizer.getInputDesc(vertex));

  let attrs = Array.map(Internals.getInputName, inputs);
  let formats = Array.map(Internals.toAttrFormat, inputs);

  let vs = GlslOptimizer.getOutput(vertex);
  let fs = GlslOptimizer.getOutput(fragment);
  let shader = Internals.makeShader(vs, fs, attrs);

  Internals.makePipeline(shader, formats);
};

let makeBuffer = Internals.makeBuffer;
let makeBindings = Internals.makeBindings;
let applyPipeline = Internals.applyPipeline;
let applyBindings = Internals.applyBindings;
let applyVertexBuffer = Internals.applyVertexBuffer;
let beginPass = Internals.beginPass;
let draw = Internals.draw;
let endPass = Internals.endPass;
let commit = Internals.commit;
