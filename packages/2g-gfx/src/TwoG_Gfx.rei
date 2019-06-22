exception InvalidAttribute(string);
exception InvalidTexture(string);

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

/* sg_image_type */
type textureFormat =
  | Default
  | Sampler2D
  | SamplerCube
  | Sampler3D
  | SamplerArray;

/* sg_uniform_type */
type uniform =
  | Float(float)
  | Vec2(float, float)
  | Vec3(float, float, float)
  | Vec4(float, float, float, float)
  | Mat4(array(float));

type colorT = (float, float, float, float);
type textureT = (string, textureFormat);
type attributeT = (int, vertexFormat);

type vertexBigarrayT = Bigarray.Array1.t(float, Bigarray.float32_elt, Bigarray.c_layout);
type indexBigarrayT = Bigarray.Array1.t(int, Bigarray.int16_unsigned_elt, Bigarray.c_layout);

type vertexBufferT;
type indexBufferT;

type shaderT;
type pipelineT;
type bindingsT;

let makeVertexBuffer: vertexBigarrayT => vertexBufferT;
let makeIndexBuffer: indexBigarrayT => indexBufferT;
let vertexBufferOfArray: array(float) => vertexBufferT;
let indexBufferOfArray: array(int) => indexBufferT;

let start: (~init: unit => 't, ~frame: 't => 't) => unit;
let makeShader: (~vs: string, ~fs: string, ~attrs: array(string)) => pipelineT;
let makePipeline: (~useIndex: bool=?, shaderT, array(attributeT)) => pipelineT;
let makeProgram: (~useIndex: bool=?, ~vs: string, ~fs: string) => pipelineT;
let applyPipeline: pipelineT => unit;
let applyBuffers: (~indexBuffer: indexBufferT=?, array(vertexBufferT)) => unit;
let applyVertexUniforms: array(uniform) => unit;
let applyFragmentUniforms: array(uniform) => unit;
let beginPass: (~clearColor: colorT=?, unit) => unit;
let draw: (int, int, int) => unit;
let endPass: unit => unit;
let commit: unit => unit;
