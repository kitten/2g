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

let bufferOfBigarray: bufferDescT => bufferT;
let bufferOfArray: array(float) => bufferT;

let start: (~init: unit => 't, ~frame: 't => 't) => unit;
let makeShader: (~vs: string, ~fs: string, ~attrs: array(string)) => pipelineT;
let makePipeline: (shaderT, array(vertexFormat)) => pipelineT;
let makeProgram: (~vs: string, ~fs: string) => pipelineT;
let applyPipeline: pipelineT => unit;
let applyBuffers: (~indexBuffer: bufferT=?, array(bufferT)) => unit;
let beginPass: (~clearColor: colorT=?, unit) => unit;
let draw: (int, int, int) => unit;
let endPass: unit => unit;
let commit: unit => unit;
