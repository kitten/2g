exception InvalidAttribute(string);
exception InvalidTexture(string);
exception InvalidUniform(string);

/* sg_shader_stage */
type shaderStage =
  | Vertex
  | Fragment;

/* sg_action */
type passAction =
  | Clear
  | Load;

/* sg_vertex_format */
type vertexFormat =
  | IN_INVALID
  | IN_FLOAT
  | IN_FLOAT2
  | IN_FLOAT3
  | IN_FLOAT4;

/* sg_image_type */
type textureFormat =
  | TEX_DEFAULT
  | TEX_SAMPLER2D
  | TEX_SAMPLERCUBE
  | TEX_SAMPLER3D
  | TEX_SAMPLERARRAY;

type uniformFormat =
  | UNI_FLOAT
  | UNI_FLOAT2
  | UNI_FLOAT3
  | UNI_FLOAT4
  | UNI_MAT4;

/* sg_uniform_type */
type uniform =
  | Float(float)
  | Vec2(float, float)
  | Vec3(float, float, float)
  | Vec4(float, float, float, float)
  | Mat4(array(float));

type colorT = (float, float, float, float);
type textureT = (string, textureFormat);
type uniformDescT = (string, uniformFormat);
type attributeT = (int, vertexFormat);

/* shader desc */
type shaderDescT = {
  attrs: array(string),
  textures: array(textureT),
  vsUniforms: array(uniformDescT),
  fsUniforms: array(uniformDescT)
};

type vertexBigarrayT = Bigarray.Array1.t(float, Bigarray.float32_elt, Bigarray.c_layout);
type indexBigarrayT = Bigarray.Array1.t(int, Bigarray.int16_unsigned_elt, Bigarray.c_layout);

type vertexBufferT;
type indexBufferT;

type shaderT;
type pipelineT;
type bindingsT;

let getInputName = (input: GlslOptimizer.shaderDescT) =>
  input.name;

let toAttrFormat = (input: GlslOptimizer.shaderDescT) => {
  switch (input.basicType, input.vectorSize) {
  | (Float, 1) => IN_FLOAT
  | (Float, 2) => IN_FLOAT2
  | (Float, 3) => IN_FLOAT3
  | (Float, 4) => IN_FLOAT4
  | (Float, _) =>
    raise(InvalidAttribute("Float attributes can only have dimensions of 1 to 4."))
  | (_, _) =>
    raise(InvalidAttribute("Attributes must be of type Float."))
  };
};

let toTextureFormat = (basicType: GlslOptimizer.basicType) => {
  switch (basicType) {
  | Tex2D => TEX_SAMPLER2D
  | Tex3D => TEX_SAMPLER3D
  | Cube => TEX_SAMPLERCUBE
  | Array2D => TEX_SAMPLERARRAY
  | _ =>
    raise(InvalidTexture("Sampler must be of type 2D, 3D, Cube, or 2DArray."))
  };
};

let toUniformFormat = (uniform: GlslOptimizer.shaderDescT) => {
  switch (uniform.basicType, uniform.vectorSize, uniform.matrixSize) {
  | (Float, 1, 1) => UNI_FLOAT
  | (Float, 2, 1) => UNI_FLOAT2
  | (Float, 3, 1) => UNI_FLOAT3
  | (Float, 4, 1) => UNI_FLOAT4
  | (Float, 4, 4) => UNI_MAT4
  | (Float, _, _) =>
    raise(InvalidUniform("Float uniforms can only be float, vec2, vec3, vec4, or mat4"))
  | (_, _, _) =>
    raise(InvalidUniform("Uniforms must be of type Float."))
  }
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
  ~desc: shaderDescT,
) => shaderT = "tg_make_shader";

external makePipeline: (
  ~useIndex: bool=?,
  shaderT,
  array(attributeT),
  unit
) => pipelineT = "tg_make_pipeline";

let makeProgram = (~useIndex=?, ~vs, ~fs, ()) => {
  let vertex = GlslOptimizer.convertShader(Vertex, vs);
  let fragment = GlslOptimizer.convertShader(Fragment, fs);

  let inputSize = GlslOptimizer.getInputLength(vertex);
  let inputs = Array.init(inputSize, GlslOptimizer.getInputDesc(vertex));
  let attrs = Array.map(getInputName, inputs);
  let formats = Array.mapi((index, input) => (index, toAttrFormat(input)), inputs);

  let textures = Array.init(GlslOptimizer.getTextureLength(fragment), index => {
    let textureDesc = GlslOptimizer.getTextureDesc(fragment, index);
    (textureDesc.name, toTextureFormat(textureDesc.basicType))
  });

  let vsUniforms = Array.init(GlslOptimizer.getUniformLength(vertex), index => {
    let uniformDesc = GlslOptimizer.getUniformDesc(vertex, index);
    (uniformDesc.name, toUniformFormat(uniformDesc))
  });

  let fsUniforms = Array.init(GlslOptimizer.getUniformLength(fragment), index => {
    let uniformDesc = GlslOptimizer.getUniformDesc(fragment, index);
    (uniformDesc.name, toUniformFormat(uniformDesc))
  });

  let desc = { attrs, textures, vsUniforms, fsUniforms };
  let vs = GlslOptimizer.getOutput(vertex);
  let fs = GlslOptimizer.getOutput(fragment);
  let shader = makeShader(~vs, ~fs, ~desc);
  makePipeline(~useIndex=?useIndex, shader, formats, ());
};

external makeVertexBuffer: vertexBigarrayT => vertexBufferT = "tg_make_vertex_buffer";
external makeIndexBuffer: indexBigarrayT => indexBufferT = "tg_make_index_buffer";

let vertexBufferOfArray = (data: array(float)) =>
  makeVertexBuffer(Bigarray.Array1.of_array(Float32, C_layout, data));
let indexBufferOfArray = (data: array(int)) =>
  makeIndexBuffer(Bigarray.Array1.of_array(Int16_unsigned, C_layout, data));

external applyPipeline: pipelineT => unit = "tg_apply_pipeline";

[@noalloc] external applyBuffers: (
  ~indexBuffer: indexBufferT=?,
  array(vertexBufferT)
) => unit = "tg_apply_buffers";

[@noalloc] external _applyUniforms:
  (shaderStage, int, array(uniform)) => unit = "tg_apply_uniforms";

let applyVertexUniforms = (uniforms: array(uniform)) => _applyUniforms(Vertex, 0, uniforms);
let applyFragmentUniforms = (uniforms: array(uniform)) => _applyUniforms(Fragment, 0, uniforms);

[@noalloc] external _beginPass: (colorT, bool) => unit = "tg_begin_pass";

let beginPass = (
  ~clearColor=(0.0, 0.0, 0.0, 1.0),
  ~shouldClear=true,
  ()
) => _beginPass(clearColor, shouldClear);

[@noalloc] external draw: (int, int, int) => unit = "tg_draw";
[@noalloc] external endPass: unit => unit = "tg_end_pass";
[@noalloc] external commit: unit => unit = "tg_commit";

external now: unit => float = "tg_now";
