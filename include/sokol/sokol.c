#define SOKOL_IMPL
#include "sokol.h"

#if defined(SOKOL_GLCORE33)||defined(SOKOL_GLES2)||defined(SOKOL_GLES3)
  void loadGraphics() {
    gladLoadGL();
  }
#else
  void loadGraphics() {}
#endif
