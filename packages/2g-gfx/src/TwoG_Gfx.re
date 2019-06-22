exception InvalidAttribute(string);
exception InvalidTexture(string);

/* sg_action */
type passAction =
  | Clear
  | Load;

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
  | UInt10N2;

/* sg_image_type */
type textureFormat =
  | Default
  | Sampler2D
  | SamplerCube
  | Sampler3D
  | SamplerArray;

type colorT = (float, float, float, float);

type textureT = {
  name: string,
  format: textureFormat
};

type bufferDescT = Bigarray.Array1.t(float, Bigarray.float32_elt, Bigarray.c_layout);
type bufferT;
type shaderT;
type pipelineT;
type bindingsT;

let getInputName = (input: GlslOptimizer.shaderDescT) =>
  input.name;

let toAttrFormat = (input: GlslOptimizer.shaderDescT) => {
  switch (input.basicType, input.vectorSize) {
  | (Float, 1) => Float
  | (Float, 2) => Float2
  | (Float, 3) => Float3
  | (Float, 4) => Float4
  | (Float, _) =>
    raise(InvalidAttribute("Float attributes can only have dimensions of 1 to 4."))
  | (_, _) =>
    raise(InvalidAttribute("Attributes must be of type Float."))
  };
};

let toTextureFormat = (basicType: GlslOptimizer.basicType) => {
  switch (basicType) {
  | Tex2D => Sampler2D
  | Tex3D => Sampler3D
  | Cube => SamplerCube
  | Array2D => SamplerArray
  | _ =>
    raise(InvalidTexture("Sampler must be of type 2D, 3D, Cube, or 2DArray."))
  };
};

[@noalloc] external _start: unit => unit = "tg_start";

let start = (~init: unit => 't, ~frame: 't => 't) => {
  Callback.register("tg_init_cb", init);
  Callback.register("tg_frame_cb", frame);
  _start();
};

external makeShader: (
  ~vs: string,
  ~fs: string,
  ~attrs: array(string),
  ~textures: array(textureT)
) => shaderT = "tg_make_shader";

external makePipeline: (shaderT, array(vertexFormat)) => pipelineT = "tg_make_pipeline";

let makeProgram = (~vs, ~fs) => {
  let vertex = GlslOptimizer.convertShader(Vertex, vs);
  let fragment = GlslOptimizer.convertShader(Fragment, fs);

  let inputSize = GlslOptimizer.getInputLength(vertex);
  let inputs = Array.init(inputSize, GlslOptimizer.getInputDesc(vertex));
  let attrs = Array.map(getInputName, inputs);
  let formats = Array.map(toAttrFormat, inputs);

  let textureSize = GlslOptimizer.getTextureLength(fragment);
  let textures = Array.init(textureSize, index => {
    let textureDesc = GlslOptimizer.getTextureDesc(fragment, index);
    let format = toTextureFormat(textureDesc.basicType);
    { name: textureDesc.name, format }
  });

  let vs = GlslOptimizer.getOutput(vertex);
  let fs = GlslOptimizer.getOutput(fragment);
  let shader = makeShader(~vs, ~fs, ~attrs, ~textures);

  makePipeline(shader, formats);
};

external makeBuffer: bufferDescT => bufferT = "tg_make_buffer";
external applyPipeline: pipelineT => unit = "tg_apply_pipeline";

[@noalloc] external applyBuffers: (
  ~indexBuffer: bufferT=?,
  array(bufferT)
) => unit = "tg_apply_buffers";

[@noalloc] external _beginPass: (colorT, bool) => unit = "tg_begin_pass";

let beginPass = (
  ~clearColor=(0.0, 0.0, 0.0, 1.0),
  ~shouldClear=true,
  ()
) => _beginPass(clearColor, shouldClear);

[@noalloc] external draw: (int, int, int) => unit = "tg_draw";
[@noalloc] external endPass: unit => unit = "tg_end_pass";
[@noalloc] external commit: unit => unit = "tg_commit";
