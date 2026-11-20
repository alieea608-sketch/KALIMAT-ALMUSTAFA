(function() {
  const config = window.SUPABASE_CONFIG;
  if (!config?.url || !config?.publishableKey) {
    console.error("إعدادات Supabase غير مكتملة.");
    return;
  }
  if (!window.supabase?.createClient) {
    console.error("مكتبة Supabase لم يتم تحميلها.");
    return;
  }
  const client = window.supabase.createClient(config.url, config.publishableKey);
  window.StoreAPI = {
    client: client,
    async loadContent() {
      const {data: data, error: error} = await client.from("store_content").select("products, banners, reels").eq("id", 1).maybeSingle();
      if (error) {
        console.error("خطأ في قراءة محتوى المتجر:", error);
        throw error;
      }
      return {
        products: Array.isArray(data?.products) ? data.products : [],
        banners: Array.isArray(data?.banners) ? data.banners : [],
        reels: Array.isArray(data?.reels) ? data.reels : []
      };
    },
    async saveContent(content) {
      const allowed = {};
      for (const key of [ "products", "banners", "reels" ]) {
        if (Object.prototype.hasOwnProperty.call(content, key)) {
          if (!Array.isArray(content[key])) {
            throw new Error("صيغة البيانات غير صحيحة: " + key);
          }
          allowed[key] = content[key];
        }
      }
      if (!Object.keys(allowed).length) {
        throw new Error("لا توجد بيانات لحفظها.");
      }
      const {data: data, error: error} = await client.from("store_content").update(allowed).eq("id", 1).select("id");
      if (error) {
        console.error("تعذر حفظ محتوى المتجر:", error);
        throw error;
      }
      if (!data?.length) {
        throw new Error("لم يتم حفظ التغييرات. تحقق من تسجيل دخول المدير وصلاحيات قاعدة البيانات.");
      }
      return true;
    },
    async updateSection(section, items) {
      if (![ "banners", "reels" ].includes(section)) {
        throw new Error("القسم غير مسموح بتعديله.");
      }
      if (!Array.isArray(items)) {
        throw new Error("بيانات القسم غير صحيحة.");
      }
      const {data: data, error: error} = await client.from("store_content").update({
        [section]: items,
        updated_at: (new Date).toISOString()
      }).eq("id", 1).select("id");
      if (error) {
        console.error("تعذر تحديث القسم:", error);
        throw error;
      }
      if (!data?.length) {
        throw new Error("لم يتم الحفظ. تحقق من تسجيل دخول المدير وصلاحيات قاعدة البيانات.");
      }
      return true;
    },
    async saveOrder(order) {
      const items = Array.isArray(order.items) ? order.items : [];
      const { data: data, error: error } = await client.rpc("create_order", {
        p_name: String(order.customer_name || "").slice(0, 120),
        p_phone: String(order.phone || "").slice(0, 30),
        p_gov: String(order.governorate || "").slice(0, 60),
        p_items: items.map(i => ({
          id: i.id,
          qty: Number(i.qty) || 1,
          color: String(i.color || "").slice(0, 40),
          storage: String(i.storage || "").slice(0, 60)
        }))
      });
      if (error) {
        console.error("تعذر حفظ الطلب:", error);
        if (error.code === "P0001") {
          const rejected = new Error(error.message);
          rejected.rejected = true;
          throw rejected;
        }
        throw error;
      }
      return data;
    },
    async updateOrderStatus(id, status) {
      if (![ "new", "done", "cancelled" ].includes(status)) {
        throw new Error("حالة الطلب غير صحيحة.");
      }
      const {data: data, error: error} = await client.from("orders").update({
        status: status
      }).eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("لم يتم التحديث. تحقق من تسجيل دخول المدير.");
      }
      return true;
    },
    async uploadFile(bucket, file) {
      const allowedBuckets = [ "product-images", "store-banners", "store-reels" ];
      if (!allowedBuckets.includes(bucket)) {
        throw new Error("مجلد التخزين غير مسموح.");
      }
      if (!(file instanceof File)) {
        throw new Error("لم يتم اختيار ملف صالح.");
      }
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");
      if (bucket === "store-reels" && !isVideo) {
        throw new Error("اختر ملف فيديو.");
      }
      if ([ "product-images", "store-banners" ].includes(bucket) && !isImage) {
        throw new Error("اختر ملف صورة.");
      }
      const maxSize = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Error(isVideo ? "حجم الفيديو يجب ألا يتجاوز 50 ميغابايت." : "حجم الصورة يجب ألا يتجاوز 5 ميغابايت.");
      }
      const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = Date.now() + "_" + Math.random().toString(36).slice(2, 10) + "_" + safeName;
      const {error: error} = await client.storage.from(bucket).upload(path, file, {
        upsert: false,
        contentType: file.type
      });
      if (error) {
        console.error("تعذر رفع الملف:", error);
        throw error;
      }
      const {data: data} = client.storage.from(bucket).getPublicUrl(path);
      return {
        path: path,
        url: data.publicUrl
      };
    }
  };
})();