#include <assert.h>
#include <stdio.h>
#include <stdbool.h>
#include <string.h>

#include <caml/custom.h>
#include <caml/memory.h>
#include <caml/alloc.h>
#include <caml/mlvalues.h>

#include "glsl/glsl_optimizer.h"

static glslopt_ctx* ctx = NULL;
static enum glslopt_options opts = kGlslOptionSkipPreprocessor;

/*-- glslopt_target --------------------------------------------------------*/

#if defined(__APPLE__)
  static enum glslopt_target target = kGlslTargetMetal;
#else
  static enum glslopt_target target = kGlslTargetOpenGL;
#endif

CAMLprim value tg_target() {
  CAMLparam0();
  CAMLreturn(Val_int(target));
}

/*-- glslopt_shader --------------------------------------------------------*/

void _tg_finalize_glslopt_shader(value v) {
  glslopt_shader* shader = *((glslopt_shader **) Data_custom_val(v));
  glslopt_shader_delete(shader);
}

static struct custom_operations tg_glslopt_shader = {
  .identifier = "glslopt_shader",
  .finalize = _tg_finalize_glslopt_shader,
  .compare = custom_compare_default,
  .hash = custom_hash_default,
  .serialize = custom_serialize_default,
  .deserialize = custom_deserialize_default,
};

static value _tg_copy_glslopt_shader(glslopt_shader* shader) {
  CAMLparam0();
  CAMLlocal1(val);

  // The custom block itself only contains the pointer to glslopt_shader
  val = caml_alloc_custom(&tg_glslopt_shader, sizeof(glslopt_shader*), 0, 1);
  memcpy(Data_custom_val(val), &shader, sizeof(glslopt_shader*));

  CAMLreturn(val);
}

/*-- glslopt_optimize --------------------------------------------------------*/

CAMLprim value tg_convert_shader(value type, value source) {
  CAMLparam2(type, source);
  CAMLlocal1(ret);
  if (ctx == NULL) {
    ctx = glslopt_initialize(target);
  }

  enum glslopt_shader_type glslopt_type = Int_val(type);
  const char* source_str = String_val(source);

  glslopt_shader* shader = glslopt_optimize(ctx, glslopt_type, source_str, opts);
  if (!glslopt_get_status(shader)) {
    puts("Shader failed to compile!");
		puts(glslopt_get_log(shader));
    assert(false);
  }

  ret = _tg_copy_glslopt_shader(shader);
  CAMLreturn(ret);
}

CAMLprim value tg_get_output(value shader) {
  CAMLparam1(shader);
  CAMLlocal1(str);
  glslopt_shader* shader_val = *((glslopt_shader **) Data_custom_val(shader));
  const char* output = glslopt_get_output(shader_val);
  str = caml_copy_string(output);
  CAMLreturn(str);
}

CAMLprim value tg_get_input_length(value shaderV) {
  CAMLparam1(shaderV);
  CAMLlocal1(count);
  glslopt_shader* shader = *((glslopt_shader **) Data_custom_val(shaderV));
  count = Val_int(glslopt_shader_get_input_count(shader));
  CAMLreturn(count);
}

CAMLprim value tg_get_uniform_length(value shaderV) {
  CAMLparam1(shaderV);
  CAMLlocal1(count);
  glslopt_shader* shader = *((glslopt_shader **) Data_custom_val(shaderV));
  count = Val_int(glslopt_shader_get_uniform_count(shader));
  CAMLreturn(count);
}

CAMLprim value tg_get_texture_length(value shaderV) {
  CAMLparam1(shaderV);
  CAMLlocal1(count);
  glslopt_shader* shader = *((glslopt_shader **) Data_custom_val(shaderV));
  count = Val_int(glslopt_shader_get_texture_count(shader));
  CAMLreturn(count);
}

CAMLprim value tg_get_input_desc(value shaderV, value index) {
  CAMLparam2(shaderV, index);
  CAMLlocal1(input);

  glslopt_shader* shader = *((glslopt_shader **) Data_custom_val(shaderV));

  const char* name;
  enum glslopt_basic_type type;
  enum glslopt_precision prec;
  int vecSize, matSize, arrSize, location;

  glslopt_shader_get_input_desc(
    shader, Int_val(index),
    &name, &type, &prec, &vecSize, &matSize, &arrSize, &location
  );

  input = caml_alloc(7, 0);
  Store_field(input, 0, caml_copy_string(name));
  Store_field(input, 1, Val_int(type));
  Store_field(input, 2, Val_int(prec));
  Store_field(input, 3, Val_int(vecSize));
  Store_field(input, 4, Val_int(matSize));
  Store_field(input, 5, Val_int(arrSize));
  Store_field(input, 6, Val_int(location));
  CAMLreturn(input);
}

CAMLprim value tg_get_uniform_desc(value shaderV, value index) {
  CAMLparam2(shaderV, index);
  CAMLlocal1(input);

  glslopt_shader* shader = *((glslopt_shader **) Data_custom_val(shaderV));

  const char* name;
  enum glslopt_basic_type type;
  enum glslopt_precision prec;
  int vecSize, matSize, arrSize, location;

  glslopt_shader_get_uniform_desc(
    shader, Int_val(index),
    &name, &type, &prec, &vecSize, &matSize, &arrSize, &location
  );

  input = caml_alloc(7, 0);
  Store_field(input, 0, caml_copy_string(name));
  Store_field(input, 1, Val_int(type));
  Store_field(input, 2, Val_int(prec));
  Store_field(input, 3, Val_int(vecSize));
  Store_field(input, 4, Val_int(matSize));
  Store_field(input, 5, Val_int(arrSize));
  Store_field(input, 6, Val_int(location));
  CAMLreturn(input);
}

CAMLprim value tg_get_texture_desc(value shaderV, value index) {
  CAMLparam2(shaderV, index);
  CAMLlocal1(input);

  glslopt_shader* shader = *((glslopt_shader **) Data_custom_val(shaderV));

  const char* name;
  enum glslopt_basic_type type;
  enum glslopt_precision prec;
  int vecSize, matSize, arrSize, location;

  glslopt_shader_get_texture_desc(
    shader, Int_val(index),
    &name, &type, &prec, &vecSize, &matSize, &arrSize, &location
  );

  input = caml_alloc(7, 0);
  Store_field(input, 0, caml_copy_string(name));
  Store_field(input, 1, Val_int(type));
  Store_field(input, 2, Val_int(prec));
  Store_field(input, 3, Val_int(vecSize));
  Store_field(input, 4, Val_int(matSize));
  Store_field(input, 5, Val_int(arrSize));
  Store_field(input, 6, Val_int(location));
  CAMLreturn(input);
}
