#define SOKOL_IMPL
#include "sokol.h"

#if defined(SOKOL_GLCORE33)
  void loadGraphics() {
    gladLoadGL();
  }
#else
  void loadGraphics() {}
#endif
