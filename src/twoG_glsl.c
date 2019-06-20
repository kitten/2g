#include "twoG_glsl.h"

CAMLprim value tg_target() {
  return Val_int(glsl_target());
}

CAMLprim value tg_convert_vertex(value vs) {
  CAMLparam1(vs);
  char* vs_opt = (char*) glsl_convert_vertex(String_val(vs));
  return caml_copy_string(vs_opt);
}

CAMLprim value tg_convert_fragment(value fs) {
  CAMLparam1(fs);
  char* fs_opt = (char*) glsl_convert_fragment(String_val(fs));
  return caml_copy_string(fs_opt);
}
