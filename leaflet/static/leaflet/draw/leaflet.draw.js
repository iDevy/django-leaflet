(function(e, t, n) {
    L.drawVersion = "0.2.3-dev";
    L.drawLocal = {
        draw: {
            toolbar: {
                actions: {
                    title: "Cancel drawing",
                    text: "Cancel"
                },
                undo: {
                    title: "Delete last point drawn",
                    text: "Delete last point"
                },
                buttons: {
                    polyline: "Draw a polyline",
                    polygon: "Draw a polygon",
                    rectangle: "Draw a rectangle",
                    circle: "Draw a circle",
                    marker: "Draw a marker"
                }
            },
            handlers: {
                circle: {
                    tooltip: {
                        start: "Click and drag to draw circle."
                    }
                },
                marker: {
                    tooltip: {
                        start: "Click map to place marker."
                    }
                },
                polygon: {
                    tooltip: {
                        start: "Click or tap to start drawing shape.",
                        cont: "Click or tap to continue drawing shape.",
                        end: "Click or tap first point to close this shape."
                    }
                },
                polyline: {
                    error: "<strong>Error:</strong> shape edges cannot cross!",
                    tooltip: {
                        start: "Click or tap to start drawing line.",
                        cont: "Click or tap to continue drawing line.",
                        end: "Click or tap last point to finish line."
                    }
                },
                rectangle: {
                    tooltip: {
                        start: "Click and drag to draw rectangle."
                    }
                },
                simpleshape: {
                    tooltip: {
                        end: "Release mouse to finish drawing."
                    }
                }
            }
        },
        edit: {
            toolbar: {
                actions: {
                    save: {
                        title: "Save changes.",
                        text: "Save"
                    },
                    cancel: {
                        title: "Cancel editing, discards all changes.",
                        text: "Cancel"
                    }
                },
                buttons: {
                    edit: "Edit layers.",
                    editDisabled: "No layers to edit.",
                    remove: "Delete layers.",
                    removeDisabled: "No layers to delete."
                }
            },
            handlers: {
                edit: {
                    tooltip: {
                        text: "Drag handles, or marker to edit feature.",
                        subtext: "Click cancel to undo changes."
                    }
                },
                remove: {
                    tooltip: {
                        text: "Click on a feature to remove"
                    }
                }
            }
        }
    };
    L.Draw = {};
    L.Draw.Feature = L.Handler.extend({
        includes: L.Mixin.Events,
        initialize: function(e, t) {
            this._map = e;
            this._container = e._container;
            this._overlayPane = e._panes.overlayPane;
            this._popupPane = e._panes.popupPane;
            if (t && t.shapeOptions) {
                t.shapeOptions = L.Util.extend({}, this.options.shapeOptions, t.shapeOptions)
            }
            L.setOptions(this, t)
        },
        enable: function() {
            if (this._enabled) {
                return
            }
            this.fire("enabled", {
                handler: this.type
            });
            this._map.fire("draw:drawstart", {
                layerType: this.type
            });
            L.Handler.prototype.enable.call(this)
        },
        disable: function() {
            if (!this._enabled) {
                return
            }
            L.Handler.prototype.disable.call(this);
            this._map.fire("draw:drawstop", {
                layerType: this.type
            });
            this.fire("disabled", {
                handler: this.type
            })
        },
        addHooks: function() {
            var e = this._map;
            if (e) {
                L.DomUtil.disableTextSelection();
                e.getContainer().focus();
                this._tooltip = new L.Tooltip(this._map);
                L.DomEvent.on(this._container, "keyup", this._cancelDrawing, this)
            }
        },
        removeHooks: function() {
            if (this._map) {
                L.DomUtil.enableTextSelection();
                this._tooltip.dispose();
                this._tooltip = null;
                L.DomEvent.off(this._container, "keyup", this._cancelDrawing, this)
            }
        },
        setOptions: function(e) {
            L.setOptions(this, e)
        },
        _fireCreatedEvent: function(e) {
            this._map.fire("draw:created", {
                layer: e,
                layerType: this.type
            })
        },
        _cancelDrawing: function(e) {
            if (e.keyCode === 27) {
                this.disable()
            }
        }
    });
    L.Draw.Polyline = L.Draw.Feature.extend({
        statics: {
            TYPE: "polyline"
        },
        Poly: L.Polyline,
        options: {
            allowIntersection: true,
            repeatMode: false,
            drawError: {
                color: "#b00b00",
                timeout: 2500
            },
            icon: new L.DivIcon({
                iconSize: new L.Point(14, 14),
                className: "leaflet-div-icon leaflet-editing-icon"
            }),
            guidelineDistance: 20,
            shapeOptions: {
                stroke: true,
                color: "#f06eaa",
                weight: 4,
                opacity: .5,
                fill: false,
                clickable: true
            },
            metric: true,
            showLength: true,
            zIndexOffset: 2e3
        },
        initialize: function(e, t) {
            this.options.drawError.message = L.drawLocal.draw.handlers.polyline.error;
            if (t && t.drawError) {
                t.drawError = L.Util.extend({}, this.options.drawError, t.drawError)
            }
            this.type = L.Draw.Polyline.TYPE;
            L.Draw.Feature.prototype.initialize.call(this, e, t)
        },
        addHooks: function() {
            L.Draw.Feature.prototype.addHooks.call(this);
            if (this._map) {
                this._markers = [];
                this._markerGroup = new L.LayerGroup;
                this._map.addLayer(this._markerGroup);
                this._poly = new L.Polyline([], this.options.shapeOptions);
                this._tooltip.updateContent(this._getTooltipText());
                if (!this._mouseMarker) {
                    this._mouseMarker = L.marker(this._map.getCenter(), {
                        icon: L.divIcon({
                            className: "leaflet-mouse-marker",
                            iconAnchor: [20, 20],
                            iconSize: [40, 40]
                        }),
                        opacity: 0,
                        zIndexOffset: this.options.zIndexOffset
                    })
                }
                this._mouseMarker.on("click", this._onClick, this).addTo(this._map);
                L.DomEvent.on(this._container, "touchstart", this._onTouchStart, this);
                this._map.on("mousemove", this._onMouseMove, this).on("zoomend", this._onZoomEnd, this)
            }
        },
        removeHooks: function() {
            L.Draw.Feature.prototype.removeHooks.call(this);
            this._clearHideErrorTimeout();
            this._cleanUpShape();
            this._map.removeLayer(this._markerGroup);
            delete this._markerGroup;
            delete this._markers;
            this._map.removeLayer(this._poly);
            delete this._poly;
            L.DomEvent.off(this._container, "touchstart", this._onTouchStart);
            this._mouseMarker.off("click", this._onClick, this);
            this._map.removeLayer(this._mouseMarker);
            delete this._mouseMarker;
            this._clearGuides();
            this._map.off("mousemove", this._onMouseMove, this).off("zoomend", this._onZoomEnd, this)
        },
        deleteLastVertex: function() {
            if (this._markers.length <= 1) {
                return
            }
            var e = this._markers.pop(),
                t = this._poly,
                n = this._poly.spliceLatLngs(t.getLatLngs().length - 1, 1)[0];
            this._markerGroup.removeLayer(e);
            if (t.getLatLngs().length < 2) {
                this._map.removeLayer(t)
            }
            this._vertexChanged(n, false)
        },
        addVertex: function(e) {
            var t = this._markers.length;
            if (t > 0 && !this.options.allowIntersection && this._poly.newLatLngIntersects(e)) {
                this._showErrorTooltip();
                return
            } else if (this._errorShown) {
                this._hideErrorTooltip()
            }
            this._markers.push(this._createMarker(e));
            this._poly.addLatLng(e);
            if (this._poly.getLatLngs().length === 2) {
                this._map.addLayer(this._poly)
            }
            this._vertexChanged(e, true)
        },
        _finishShape: function() {
            var e = this._poly.newLatLngIntersects(this._poly.getLatLngs()[0], true);
            if (!this.options.allowIntersection && e || !this._shapeIsValid()) {
                this._showErrorTooltip();
                return
            }
            this._fireCreatedEvent();
            this.disable();
            if (this.options.repeatMode) {
                this.enable()
            }
        },
        _shapeIsValid: function() {
            return true
        },
        _onZoomEnd: function() {
            this._updateGuide()
        },
        _onMouseMove: function(e) {
            var t = e.layerPoint,
                n = e.latlng;
            this._currentLatLng = n;
            this._updateTooltip(n);
            this._updateGuide(t);
            this._mouseMarker.setLatLng(n);
            L.DomEvent.preventDefault(e.originalEvent)
        },
        _onClick: function(e) {
            var t = e.target.getLatLng();
            this.addVertex(t)
        },
        _onTouchStart: function(e) {
            var t = e.touches[0];
            try {
                var n = this._map.mouseEventToLatLng(t)
            } catch (r) {
                var n = this._map.mouseEventToLatLng({
                    pageX: t.pageX,
                    pageY: t.pageY
                })
            }
            this._mouseMarker.setLatLng(n);
            this.addVertex(n)
        },
        _vertexChanged: function(e, t) {
            this._updateFinishHandler();
            this._updateRunningMeasure(e, t);
            this._clearGuides();
            this._updateTooltip()
        },
        _updateFinishHandler: function() {
            var e = this._markers.length;
            if (e > 1) {
                this._markers[e - 1].on("click", this._finishShape, this)
            }
            if (e > 2) {
                this._markers[e - 2].off("click", this._finishShape, this)
            }
        },
        _createMarker: function(e) {
            var t = new L.Marker(e, {
                icon: this.options.icon,
                zIndexOffset: this.options.zIndexOffset * 2
            });
            this._markerGroup.addLayer(t);
            return t
        },
        _updateGuide: function(e) {
            var t = this._markers.length;
            if (t > 0) {
                e = e || this._map.latLngToLayerPoint(this._currentLatLng);
                this._clearGuides();
                this._drawGuide(this._map.latLngToLayerPoint(this._markers[t - 1].getLatLng()), e)
            }
        },
        _updateTooltip: function(e) {
            var t = this._getTooltipText();
            if (e) {
                this._tooltip.updatePosition(e)
            }
            if (!this._errorShown) {
                this._tooltip.updateContent(t)
            }
        },
        _drawGuide: function(e, t) {
            var n = Math.floor(Math.sqrt(Math.pow(t.x - e.x, 2) + Math.pow(t.y - e.y, 2))),
                r, i, s, o;
            if (!this._guidesContainer) {
                this._guidesContainer = L.DomUtil.create("div", "leaflet-draw-guides", this._overlayPane)
            }
            for (r = this.options.guidelineDistance; r < n; r += this.options.guidelineDistance) {
                i = r / n;
                s = {
                    x: Math.floor(e.x * (1 - i) + i * t.x),
                    y: Math.floor(e.y * (1 - i) + i * t.y)
                };
                o = L.DomUtil.create("div", "leaflet-draw-guide-dash", this._guidesContainer);
                o.style.backgroundColor = !this._errorShown ? this.options.shapeOptions.color : this.options.drawError.color;
                L.DomUtil.setPosition(o, s)
            }
        },
        _updateGuideColor: function(e) {
            if (this._guidesContainer) {
                for (var t = 0, n = this._guidesContainer.childNodes.length; t < n; t++) {
                    this._guidesContainer.childNodes[t].style.backgroundColor = e
                }
            }
        },
        _clearGuides: function() {
            if (this._guidesContainer) {
                while (this._guidesContainer.firstChild) {
                    this._guidesContainer.removeChild(this._guidesContainer.firstChild)
                }
            }
        },
        _getTooltipText: function() {
            var e = this.options.showLength,
                t, n;
            if (this._markers.length === 0) {
                t = {
                    text: L.drawLocal.draw.handlers.polyline.tooltip.start
                }
            } else {
                n = e ? this._getMeasurementString() : "";
                if (this._markers.length === 1) {
                    t = {
                        text: L.drawLocal.draw.handlers.polyline.tooltip.cont,
                        subtext: n
                    }
                } else {
                    t = {
                        text: L.drawLocal.draw.handlers.polyline.tooltip.end,
                        subtext: n
                    }
                }
            }
            return t
        },
        _updateRunningMeasure: function(e, t) {
            var n = this._markers.length,
                r, i;
            if (this._markers.length === 1) {
                this._measurementRunningTotal = 0
            } else {
                r = n - (t ? 2 : 1);
                i = e.distanceTo(this._markers[r].getLatLng());
                this._measurementRunningTotal += i * (t ? 1 : -1)
            }
        },
        _getMeasurementString: function() {
            var e = this._currentLatLng,
                t = this._markers[this._markers.length - 1].getLatLng(),
                n;
            n = this._measurementRunningTotal + e.distanceTo(t);
            return L.GeometryUtil.readableDistance(n, this.options.metric)
        },
        _showErrorTooltip: function() {
            this._errorShown = true;
            this._tooltip.showAsError().updateContent({
                text: this.options.drawError.message
            });
            this._updateGuideColor(this.options.drawError.color);
            this._poly.setStyle({
                color: this.options.drawError.color
            });
            this._clearHideErrorTimeout();
            this._hideErrorTimeout = setTimeout(L.Util.bind(this._hideErrorTooltip, this), this.options.drawError.timeout)
        },
        _hideErrorTooltip: function() {
            this._errorShown = false;
            this._clearHideErrorTimeout();
            this._tooltip.removeError().updateContent(this._getTooltipText());
            this._updateGuideColor(this.options.shapeOptions.color);
            this._poly.setStyle({
                color: this.options.shapeOptions.color
            })
        },
        _clearHideErrorTimeout: function() {
            if (this._hideErrorTimeout) {
                clearTimeout(this._hideErrorTimeout);
                this._hideErrorTimeout = null
            }
        },
        _cleanUpShape: function() {
            if (this._markers.length > 1) {
                this._markers[this._markers.length - 1].off("click", this._finishShape, this)
            }
        },
        _fireCreatedEvent: function() {
            var e = new this.Poly(this._poly.getLatLngs(), this.options.shapeOptions);
            L.Draw.Feature.prototype._fireCreatedEvent.call(this, e)
        }
    });
    L.Draw.Polygon = L.Draw.Polyline.extend({
        statics: {
            TYPE: "polygon"
        },
        Poly: L.Polygon,
        options: {
            showArea: false,
            shapeOptions: {
                stroke: true,
                color: "#f06eaa",
                weight: 4,
                opacity: .5,
                fill: true,
                fillColor: null,
                fillOpacity: .2,
                clickable: true
            }
        },
        initialize: function(e, t) {
            L.Draw.Polyline.prototype.initialize.call(this, e, t);
            this.type = L.Draw.Polygon.TYPE
        },
        _updateFinishHandler: function() {
            var e = this._markers.length;
            if (e === 1) {
                this._markers[0].on("click", this._finishShape, this);
                this._markers[0].on("touchstart", this._finishShape, this)
            }
            if (e > 2) {
                this._markers[e - 1].on("dblclick", this._finishShape, this);
                if (e > 3) {
                    this._markers[e - 2].off("dblclick", this._finishShape, this)
                }
            }
        },
        _getTooltipText: function() {
            var e, t;
            if (this._markers.length === 0) {
                e = L.drawLocal.draw.handlers.polygon.tooltip.start
            } else if (this._markers.length < 3) {
                e = L.drawLocal.draw.handlers.polygon.tooltip.cont
            } else {
                e = L.drawLocal.draw.handlers.polygon.tooltip.end;
                t = this._getMeasurementString()
            }
            return {
                text: e,
                subtext: t
            }
        },
        _getMeasurementString: function() {
            var e = this._area;
            if (!e) {
                return null
            }
            return L.GeometryUtil.readableArea(e, this.options.metric)
        },
        _shapeIsValid: function() {
            return this._markers.length >= 3
        },
        _vertexAdded: function() {
            if (this.options.allowIntersection || !this.options.showArea) {
                return
            }
            var e = this._poly.getLatLngs();
            this._area = L.GeometryUtil.geodesicArea(e)
        },
        _cleanUpShape: function() {
            var e = this._markers.length;
            if (e > 0) {
                this._markers[0].off("click", this._finishShape, this);
                this._markers[0].off("touchstart", this._finishShape, this);
                if (e > 2) {
                    this._markers[e - 1].off("dblclick", this._finishShape, this)
                }
            }
        }
    });
    L.SimpleShape = {};
    L.Draw.SimpleShape = L.Draw.Feature.extend({
        options: {
            repeatMode: false
        },
        initialize: function(e, t) {
            this._endLabelText = L.drawLocal.draw.handlers.simpleshape.tooltip.end;
            L.Draw.Feature.prototype.initialize.call(this, e, t)
        },
        addHooks: function() {
            L.Draw.Feature.prototype.addHooks.call(this);
            if (this._map) {
                this._map.dragging.disable();
                this._container.style.cursor = "crosshair";
                this._tooltip.updateContent({
                    text: this._initialLabelText
                });
                this._map.on("mousedown", this._onMouseDown, this).on("mousemove", this._onMouseMove, this)
            }
        },
        removeHooks: function() {
            L.Draw.Feature.prototype.removeHooks.call(this);
            if (this._map) {
                this._map.dragging.enable();
                this._container.style.cursor = "";
                this._map.off("mousedown", this._onMouseDown, this).off("mousemove", this._onMouseMove, this);
                L.DomEvent.off(t, "mouseup", this._onMouseUp, this);
                if (this._shape) {
                    this._map.removeLayer(this._shape);
                    delete this._shape
                }
            }
            this._isDrawing = false
        },
        _onMouseDown: function(e) {
            this._isDrawing = true;
            this._startLatLng = e.latlng;
            L.DomEvent.on(t, "mouseup", this._onMouseUp, this).preventDefault(e.originalEvent)
        },
        _onMouseMove: function(e) {
            var t = e.latlng;
            this._tooltip.updatePosition(t);
            if (this._isDrawing) {
                this._tooltip.updateContent({
                    text: this._endLabelText
                });
                this._drawShape(t)
            }
        },
        _onMouseUp: function() {
            if (this._shape) {
                this._fireCreatedEvent()
            }
            this.disable();
            if (this.options.repeatMode) {
                this.enable()
            }
        }
    });
    L.Draw.Rectangle = L.Draw.SimpleShape.extend({
        statics: {
            TYPE: "rectangle"
        },
        options: {
            shapeOptions: {
                stroke: true,
                color: "#f06eaa",
                weight: 4,
                opacity: .5,
                fill: true,
                fillColor: null,
                fillOpacity: .2,
                clickable: true
            }
        },
        initialize: function(e, t) {
            this.type = L.Draw.Rectangle.TYPE;
            this._initialLabelText = L.drawLocal.draw.handlers.rectangle.tooltip.start;
            L.Draw.SimpleShape.prototype.initialize.call(this, e, t)
        },
        _drawShape: function(e) {
            if (!this._shape) {
                this._shape = new L.Rectangle(new L.LatLngBounds(this._startLatLng, e), this.options.shapeOptions);
                this._map.addLayer(this._shape)
            } else {
                this._shape.setBounds(new L.LatLngBounds(this._startLatLng, e))
            }
        },
        _fireCreatedEvent: function() {
            var e = new L.Rectangle(this._shape.getBounds(), this.options.shapeOptions);
            L.Draw.SimpleShape.prototype._fireCreatedEvent.call(this, e)
        }
    });
    L.Draw.Circle = L.Draw.SimpleShape.extend({
        statics: {
            TYPE: "circle"
        },
        options: {
            shapeOptions: {
                stroke: true,
                color: "#f06eaa",
                weight: 4,
                opacity: .5,
                fill: true,
                fillColor: null,
                fillOpacity: .2,
                clickable: true
            },
            showRadius: true,
            metric: true
        },
        initialize: function(e, t) {
            this.type = L.Draw.Circle.TYPE;
            this._initialLabelText = L.drawLocal.draw.handlers.circle.tooltip.start;
            L.Draw.SimpleShape.prototype.initialize.call(this, e, t)
        },
        _drawShape: function(e) {
            if (!this._shape) {
                this._shape = new L.Circle(this._startLatLng, this._startLatLng.distanceTo(e), this.options.shapeOptions);
                this._map.addLayer(this._shape)
            } else {
                this._shape.setRadius(this._startLatLng.distanceTo(e))
            }
        },
        _fireCreatedEvent: function() {
            var e = new L.Circle(this._startLatLng, this._shape.getRadius(), this.options.shapeOptions);
            L.Draw.SimpleShape.prototype._fireCreatedEvent.call(this, e)
        },
        _onMouseMove: function(e) {
            var t = e.latlng,
                n = this.options.showRadius,
                r = this.options.metric,
                i;
            this._tooltip.updatePosition(t);
            if (this._isDrawing) {
                this._drawShape(t);
                i = this._shape.getRadius().toFixed(1);
                this._tooltip.updateContent({
                    text: this._endLabelText,
                    subtext: n ? "Radius: " + L.GeometryUtil.readableDistance(i, r) : ""
                })
            }
        }
    });
    L.Draw.Marker = L.Draw.Feature.extend({
        statics: {
            TYPE: "marker"
        },
        options: {
            icon: new L.Icon.Default,
            repeatMode: false,
            zIndexOffset: 2e3
        },
        initialize: function(e, t) {
            this.type = L.Draw.Marker.TYPE;
            L.Draw.Feature.prototype.initialize.call(this, e, t)
        },
        addHooks: function() {
            L.Draw.Feature.prototype.addHooks.call(this);
            if (this._map) {
                this._tooltip.updateContent({
                    text: L.drawLocal.draw.handlers.marker.tooltip.start
                });
                if (!this._mouseMarker) {
                    this._mouseMarker = L.marker(this._map.getCenter(), {
                        icon: L.divIcon({
                            className: "leaflet-mouse-marker",
                            iconAnchor: [20, 20],
                            iconSize: [40, 40]
                        }),
                        opacity: 0,
                        zIndexOffset: this.options.zIndexOffset
                    })
                }
                this._mouseMarker.on("click", this._onClick, this).addTo(this._map);
                this._map.on("mousemove", this._onMouseMove, this)
            }
        },
        removeHooks: function() {
            L.Draw.Feature.prototype.removeHooks.call(this);
            if (this._map) {
                if (this._marker) {
                    this._marker.off("click", this._onClick, this);
                    this._map.off("click", this._onClick, this).removeLayer(this._marker);
                    delete this._marker
                }
                this._mouseMarker.off("click", this._onClick, this);
                this._map.removeLayer(this._mouseMarker);
                delete this._mouseMarker;
                this._map.off("mousemove", this._onMouseMove, this)
            }
        },
        _onMouseMove: function(e) {
            var t = e.latlng;
            this._tooltip.updatePosition(t);
            this._mouseMarker.setLatLng(t);
            if (!this._marker) {
                this._marker = new L.Marker(t, {
                    icon: this.options.icon,
                    zIndexOffset: this.options.zIndexOffset
                });
                this._marker.on("click", this._onClick, this);
                this._map.on("click", this._onClick, this).addLayer(this._marker)
            } else {
                t = this._mouseMarker.getLatLng();
                this._marker.setLatLng(t)
            }
        },
        _onClick: function() {
            this._fireCreatedEvent();
            this.disable();
            if (this.options.repeatMode) {
                this.enable()
            }
        },
        _fireCreatedEvent: function() {
            var e = new L.Marker(this._marker.getLatLng(), {
                icon: this.options.icon
            });
            L.Draw.Feature.prototype._fireCreatedEvent.call(this, e)
        }
    });
L.Draw.MarkerTouch = L.Draw.Marker.extend({
	initialize: function (map, options) {
		L.Draw.Marker.prototype.initialize.call(this, map, options);
	},
	addHooks: function () {
		L.Draw.Marker.prototype.addHooks.call(this);
		L.DomEvent.addListener(this._map._container, 'touchstart', this._onTouchStart, this);
		L.DomEvent.addListener(this._map._container, 'touchmove', this._onTouchMove, this);
		L.DomEvent.addListener(this._map._container, 'touchend', this._onTouchEnd, this);
	},
	removeHooks: function () {
		L.Draw.Marker.prototype.removeHooks.call(this);
		if (this._map) {
			L.DomEvent.removeListener(this._map._container, 'touchstart', this._onTouchStart, this);
			L.DomEvent.removeListener(this._map._container, 'touchmove', this._onTouchMove, this);
			L.DomEvent.addListener(this._map._container, 'touchend', this._onTouchEnd, this);
		}
	},
	_normaliseEvent: function (e) {
		L.DomUtil.disableImageDrag();
		L.DomUtil.disableTextSelection();

		var first = e.touches ? e.touches[0] : e;
		var containerPoint = this._map.mouseEventToContainerPoint(first),
			layerPoint = this._map.mouseEventToLayerPoint(first),
			latlng = this._map.layerPointToLatLng(layerPoint);

		return {
			latlng: latlng,
			layerPoint: layerPoint,
			containerPoint: containerPoint,
			clientX: first.clientX,
			clientY: first.clientY,
			originalEvent: e
		};
	},
	_onTouchStart: function (e) {
		// Make sure it's a one fingure gesture and record the starting point
		if (e.touches.length === 1) {
			var normalisedEvent = this._normaliseEvent(e);
			this._currentLatLng = normalisedEvent.latlng;
			this._touchOriginPoint = L.point(normalisedEvent.clientX, normalisedEvent.clientY);
		}
	},
	_onTouchMove: function (e) {
		// Ensure we saved the starting point
		if (this._touchOriginPoint) {
			var normalisedEvent = this._normaliseEvent(e);
			this._touchEndPoint = L.point(normalisedEvent.clientX, normalisedEvent.clientY);
		}
	},
	_onTouchEnd: function (e) {
		// Make sure we have a starting point
		if (this._touchOriginPoint) {

			if (this._touchEndPoint) {
				// If we have an end point we need to see how much it's moved before we decide if we save
				// We detect clicks within a certain tolerance, otherwise let it
				// be interpreted as a drag by the map
				var distanceMoved = L.point(this._touchEndPoint).distanceTo(this._touchOriginPoint);
				if (Math.abs(distanceMoved) < 9 * (window.devicePixelRatio || 1)) {
					this._fireTouchCreatedEvent();
				}
			} else {
				// If there is no _touchEndPoint we save straight away as this means no movement i.e. definetly a click.
				this._fireTouchCreatedEvent();
			}
		}
		// No matter what remove the start and end point ready for the next touch.
		this._touchOriginPoint = null;
		this._currentLatLng = null;
		this._touchEndPoint = null;
	},
	_fireTouchCreatedEvent: function () {
		var marker = new L.Marker(this._currentLatLng, {
			icon: this.options.icon
		});
		L.Draw.Feature.prototype._fireCreatedEvent.call(this, marker);
		this.disable();
		if (this.options.repeatMode) {
			this.enable();
		}
	}
});
    L.Edit = L.Edit || {};
    L.Edit.Poly = L.Handler.extend({
        options: {
            icon: new L.DivIcon({
                iconSize: new L.Point(14, 14),
                className: "leaflet-div-icon leaflet-editing-icon"
            })
        },
        initialize: function(e, t) {
            this._poly = e;
            L.setOptions(this, t)
        },
        addHooks: function() {
            if (this._poly._map) {
                if (!this._markerGroup) {
                    this._initMarkers()
                }
                this._poly._map.addLayer(this._markerGroup)
            }
        },
        removeHooks: function() {
            if (this._poly._map) {
                this._poly._map.removeLayer(this._markerGroup);
                delete this._markerGroup;
                delete this._markers
            }
        },
        updateMarkers: function() {
            this._markerGroup.clearLayers();
            this._initMarkers()
        },
        _initMarkers: function() {
            if (!this._markerGroup) {
                this._markerGroup = new L.LayerGroup
            }
            this._markers = [];
            var e = this._poly._latlngs,
                t, n, r, i;
            for (t = 0, r = e.length; t < r; t++) {
                i = this._createMarker(e[t], t);
                i.on("click", this._onMarkerClick, this);
                this._markers.push(i)
            }
            var s, o;
            for (t = 0, n = r - 1; t < r; n = t++) {
                if (t === 0 && !(L.Polygon && this._poly instanceof L.Polygon)) {
                    continue
                }
                s = this._markers[n];
                o = this._markers[t];
                this._createMiddleMarker(s, o);
                this._updatePrevNext(s, o)
            }
        },
        _createMarker: function(e, t) {
            var n = new L.Marker(e, {
                draggable: true,
                icon: this.options.icon
            });
            n._origLatLng = e;
            n._index = t;
            n.on("drag", this._onMarkerDrag, this);
            n.on("dragend", this._fireEdit, this);
            this._markerGroup.addLayer(n);
            return n
        },
        _removeMarker: function(e) {
            var t = e._index;
            this._markerGroup.removeLayer(e);
            this._markers.splice(t, 1);
            this._poly.spliceLatLngs(t, 1);
            this._updateIndexes(t, -1);
            e.off("drag", this._onMarkerDrag, this).off("dragend", this._fireEdit, this).off("click", this._onMarkerClick, this)
        },
        _fireEdit: function() {
            this._poly.edited = true;
            this._poly.fire("edit")
        },
        _onMarkerDrag: function(e) {
            var t = e.target;
            L.extend(t._origLatLng, t._latlng);
            if (t._middleLeft) {
                t._middleLeft.setLatLng(this._getMiddleLatLng(t._prev, t))
            }
            if (t._middleRight) {
                t._middleRight.setLatLng(this._getMiddleLatLng(t, t._next))
            }
            this._poly.redraw()
        },
        _onMarkerClick: function(e) {
            var t = L.Polygon && this._poly instanceof L.Polygon ? 4 : 3,
                n = e.target;
            if (this._poly._latlngs.length < t) {
                return
            }
            this._removeMarker(n);
            this._updatePrevNext(n._prev, n._next);
            if (n._middleLeft) {
                this._markerGroup.removeLayer(n._middleLeft)
            }
            if (n._middleRight) {
                this._markerGroup.removeLayer(n._middleRight)
            }
            if (n._prev && n._next) {
                this._createMiddleMarker(n._prev, n._next)
            } else if (!n._prev) {
                n._next._middleLeft = null
            } else if (!n._next) {
                n._prev._middleRight = null
            }
            this._fireEdit()
        },
        _updateIndexes: function(e, t) {
            this._markerGroup.eachLayer(function(n) {
                if (n._index > e) {
                    n._index += t
                }
            })
        },
        _createMiddleMarker: function(e, t) {
            var n = this._getMiddleLatLng(e, t),
                r = this._createMarker(n),
                i, s, o;
            r.setOpacity(.6);
            e._middleRight = t._middleLeft = r;
            s = function() {
                var s = t._index;
                r._index = s;
                r.off("click", i, this).on("click", this._onMarkerClick, this);
                n.lat = r.getLatLng().lat;
                n.lng = r.getLatLng().lng;
                this._poly.spliceLatLngs(s, 0, n);
                this._markers.splice(s, 0, r);
                r.setOpacity(1);
                this._updateIndexes(s, 1);
                t._index++;
                this._updatePrevNext(e, r);
                this._updatePrevNext(r, t);
                this._poly.fire("editstart")
            };
            o = function() {
                r.off("dragstart", s, this);
                r.off("dragend", o, this);
                this._createMiddleMarker(e, r);
                this._createMiddleMarker(r, t)
            };
            i = function() {
                s.call(this);
                o.call(this);
                this._fireEdit()
            };
            r.on("click", i, this).on("dragstart", s, this).on("dragend", o, this);
            this._markerGroup.addLayer(r)
        },
        _updatePrevNext: function(e, t) {
            if (e) {
                e._next = t
            }
            if (t) {
                t._prev = e
            }
        },
        _getMiddleLatLng: function(e, t) {
            var n = this._poly._map,
                r = n.project(e.getLatLng()),
                i = n.project(t.getLatLng());
            return n.unproject(r._add(i)._divideBy(2))
        }
    });
    L.Polyline.addInitHook(function() {
        if (this.editing) {
            return
        }
        if (L.Edit.Poly) {
            this.editing = new L.Edit.Poly(this);
            if (this.options.editable) {
                this.editing.enable()
            }
        }
        this.on("add", function() {
            if (this.editing && this.editing.enabled()) {
                this.editing.addHooks()
            }
        });
        this.on("remove", function() {
            if (this.editing && this.editing.enabled()) {
                this.editing.removeHooks()
            }
        })
    });
    L.Edit = L.Edit || {};
    L.Edit.SimpleShape = L.Handler.extend({
        options: {
            moveIcon: new L.DivIcon({
                iconSize: new L.Point(14, 14),
                className: "leaflet-div-icon leaflet-editing-icon leaflet-edit-move"
            }),
            resizeIcon: new L.DivIcon({
                iconSize: new L.Point(14, 14),
                className: "leaflet-div-icon leaflet-editing-icon leaflet-edit-resize"
            })
        },
        initialize: function(e, t) {
            this._shape = e;
            L.Util.setOptions(this, t)
        },
        addHooks: function() {
            if (this._shape._map) {
                this._map = this._shape._map;
                if (!this._markerGroup) {
                    this._initMarkers()
                }
                this._map.addLayer(this._markerGroup)
            }
        },
        removeHooks: function() {
            if (this._shape._map) {
                this._unbindMarker(this._moveMarker);
                for (var e = 0, t = this._resizeMarkers.length; e < t; e++) {
                    this._unbindMarker(this._resizeMarkers[e])
                }
                this._resizeMarkers = null;
                this._map.removeLayer(this._markerGroup);
                delete this._markerGroup
            }
            this._map = null
        },
        updateMarkers: function() {
            this._markerGroup.clearLayers();
            this._initMarkers()
        },
        _initMarkers: function() {
            if (!this._markerGroup) {
                this._markerGroup = new L.LayerGroup
            }
            this._createMoveMarker();
            this._createResizeMarker()
        },
        _createMoveMarker: function() {},
        _createResizeMarker: function() {},
        _createMarker: function(e, t) {
            var n = new L.Marker(e, {
                draggable: true,
                icon: t,
                zIndexOffset: 10
            });
            this._bindMarker(n);
            this._markerGroup.addLayer(n);
            return n
        },
        _bindMarker: function(e) {
            e.on("dragstart", this._onMarkerDragStart, this).on("drag", this._onMarkerDrag, this).on("dragend", this._onMarkerDragEnd, this)
        },
        _unbindMarker: function(e) {
            e.off("dragstart", this._onMarkerDragStart, this).off("drag", this._onMarkerDrag, this).off("dragend", this._onMarkerDragEnd, this)
        },
        _onMarkerDragStart: function(e) {
            var t = e.target;
            t.setOpacity(0);
            this._shape.fire("editstart")
        },
        _fireEdit: function() {
            this._shape.edited = true;
            this._shape.fire("edit")
        },
        _onMarkerDrag: function(e) {
            var t = e.target,
                n = t.getLatLng();
            if (t === this._moveMarker) {
                this._move(n)
            } else {
                this._resize(n)
            }
            this._shape.redraw()
        },
        _onMarkerDragEnd: function(e) {
            var t = e.target;
            t.setOpacity(1);
            this._fireEdit()
        },
        _move: function() {},
        _resize: function() {}
    });
    L.Edit = L.Edit || {};
    L.Edit.Rectangle = L.Edit.SimpleShape.extend({
        _createMoveMarker: function() {
            var e = this._shape.getBounds(),
                t = e.getCenter();
            this._moveMarker = this._createMarker(t, this.options.moveIcon)
        },
        _createResizeMarker: function() {
            var e = this._getCorners();
            this._resizeMarkers = [];
            for (var t = 0, n = e.length; t < n; t++) {
                this._resizeMarkers.push(this._createMarker(e[t], this.options.resizeIcon));
                this._resizeMarkers[t]._cornerIndex = t
            }
        },
        _onMarkerDragStart: function(e) {
            L.Edit.SimpleShape.prototype._onMarkerDragStart.call(this, e);
            var t = this._getCorners(),
                n = e.target,
                r = n._cornerIndex;
            this._oppositeCorner = t[(r + 2) % 4];
            this._toggleCornerMarkers(0, r)
        },
        _onMarkerDragEnd: function(e) {
            var t = e.target,
                n, r;
            if (t === this._moveMarker) {
                n = this._shape.getBounds();
                r = n.getCenter();
                t.setLatLng(r)
            }
            this._toggleCornerMarkers(1);
            this._repositionCornerMarkers();
            L.Edit.SimpleShape.prototype._onMarkerDragEnd.call(this, e)
        },
        _move: function(e) {
            var t = this._shape.getLatLngs(),
                n = this._shape.getBounds(),
                r = n.getCenter(),
                i, s = [];
            for (var o = 0, u = t.length; o < u; o++) {
                i = [t[o].lat - r.lat, t[o].lng - r.lng];
                s.push([e.lat + i[0], e.lng + i[1]])
            }
            this._shape.setLatLngs(s);
            this._repositionCornerMarkers()
        },
        _resize: function(e) {
            var t;
            this._shape.setBounds(L.latLngBounds(e, this._oppositeCorner));
            t = this._shape.getBounds();
            this._moveMarker.setLatLng(t.getCenter())
        },
        _getCorners: function() {
            var e = this._shape.getBounds(),
                t = e.getNorthWest(),
                n = e.getNorthEast(),
                r = e.getSouthEast(),
                i = e.getSouthWest();
            return [t, n, r, i]
        },
        _toggleCornerMarkers: function(e) {
            for (var t = 0, n = this._resizeMarkers.length; t < n; t++) {
                this._resizeMarkers[t].setOpacity(e)
            }
        },
        _repositionCornerMarkers: function() {
            var e = this._getCorners();
            for (var t = 0, n = this._resizeMarkers.length; t < n; t++) {
                this._resizeMarkers[t].setLatLng(e[t])
            }
        }
    });
    L.Rectangle.addInitHook(function() {
        if (L.Edit.Rectangle) {
            this.editing = new L.Edit.Rectangle(this);
            if (this.options.editable) {
                this.editing.enable()
            }
        }
    });
    L.Edit = L.Edit || {};
    L.Edit.Circle = L.Edit.SimpleShape.extend({
        _createMoveMarker: function() {
            var e = this._shape.getLatLng();
            this._moveMarker = this._createMarker(e, this.options.moveIcon)
        },
        _createResizeMarker: function() {
            var e = this._shape.getLatLng(),
                t = this._getResizeMarkerPoint(e);
            this._resizeMarkers = [];
            this._resizeMarkers.push(this._createMarker(t, this.options.resizeIcon))
        },
        _getResizeMarkerPoint: function(e) {
            var t = this._shape._radius * Math.cos(Math.PI / 4),
                n = this._map.project(e);
            return this._map.unproject([n.x + t, n.y - t])
        },
        _move: function(e) {
            var t = this._getResizeMarkerPoint(e);
            this._resizeMarkers[0].setLatLng(t);
            this._shape.setLatLng(e)
        },
        _resize: function(e) {
            var t = this._moveMarker.getLatLng(),
                n = t.distanceTo(e);
            this._shape.setRadius(n)
        }
    });
    L.Circle.addInitHook(function() {
        if (L.Edit.Circle) {
            this.editing = new L.Edit.Circle(this);
            if (this.options.editable) {
                this.editing.enable()
            }
        }
        this.on("add", function() {
            if (this.editing && this.editing.enabled()) {
                this.editing.addHooks()
            }
        });
        this.on("remove", function() {
            if (this.editing && this.editing.enabled()) {
                this.editing.removeHooks()
            }
        })
    });
    L.LatLngUtil = {
        cloneLatLngs: function(e) {
            var t = [];
            for (var n = 0, r = e.length; n < r; n++) {
                t.push(this.cloneLatLng(e[n]))
            }
            return t
        },
        cloneLatLng: function(e) {
            return L.latLng(e.lat, e.lng)
        }
    };
    L.GeometryUtil = L.extend(L.GeometryUtil || {}, {
        geodesicArea: function(e) {
            var t = e.length,
                n = 0,
                r = L.LatLng.DEG_TO_RAD,
                i, s;
            if (t > 2) {
                for (var o = 0; o < t; o++) {
                    i = e[o];
                    s = e[(o + 1) % t];
                    n += (s.lng - i.lng) * r * (2 + Math.sin(i.lat * r) + Math.sin(s.lat * r))
                }
                n = n * 6378137 * 6378137 / 2
            }
            return Math.abs(n)
        },
        readableArea: function(e, t) {
            var n;
            if (t) {
                if (e >= 1e4) {
                    n = (e * 1e-4).toFixed(2) + " ha"
                } else {
                    n = e.toFixed(2) + " m&sup2;"
                }
            } else {
                e *= .836127;
                if (e >= 3097600) {
                    n = (e / 3097600).toFixed(2) + " mi&sup2;"
                } else if (e >= 4840) {
                    n = (e / 4840).toFixed(2) + " acres"
                } else {
                    n = Math.ceil(e) + " yd&sup2;"
                }
            }
            return n
        },
        readableDistance: function(e, t) {
            var n;
            if (t) {
                if (e > 1e3) {
                    n = (e / 1e3).toFixed(2) + " km"
                } else {
                    n = Math.ceil(e) + " m"
                }
            } else {
                e *= 1.09361;
                if (e > 1760) {
                    n = (e / 1760).toFixed(2) + " miles"
                } else {
                    n = Math.ceil(e) + " yd"
                }
            }
            return n
        }
    });
    L.Util.extend(L.LineUtil, {
        segmentsIntersect: function(e, t, n, r) {
            return this._checkCounterclockwise(e, n, r) !== this._checkCounterclockwise(t, n, r) && this._checkCounterclockwise(e, t, n) !== this._checkCounterclockwise(e, t, r)
        },
        _checkCounterclockwise: function(e, t, n) {
            return (n.y - e.y) * (t.x - e.x) > (t.y - e.y) * (n.x - e.x)
        }
    });
    L.Polyline.include({
        intersects: function() {
            var e = this._originalPoints,
                t = e ? e.length : 0,
                n, r, i;
            if (this._tooFewPointsForIntersection()) {
                return false
            }
            for (n = t - 1; n >= 3; n--) {
                r = e[n - 1];
                i = e[n];
                if (this._lineSegmentsIntersectsRange(r, i, n - 2)) {
                    return true
                }
            }
            return false
        },
        newLatLngIntersects: function(e, t) {
            if (!this._map) {
                return false
            }
            return this.newPointIntersects(this._map.latLngToLayerPoint(e), t)
        },
        newPointIntersects: function(e, t) {
            var n = this._originalPoints,
                r = n ? n.length : 0,
                i = n ? n[r - 1] : null,
                s = r - 2;
            if (this._tooFewPointsForIntersection(1)) {
                return false
            }
            return this._lineSegmentsIntersectsRange(i, e, s, t ? 1 : 0)
        },
        _tooFewPointsForIntersection: function(e) {
            var t = this._originalPoints,
                n = t ? t.length : 0;
            n += e || 0;
            return !this._originalPoints || n <= 3
        },
        _lineSegmentsIntersectsRange: function(e, t, n, r) {
            var i = this._originalPoints,
                s, o;
            r = r || 0;
            for (var u = n; u > r; u--) {
                s = i[u - 1];
                o = i[u];
                if (L.LineUtil.segmentsIntersect(e, t, s, o)) {
                    return true
                }
            }
            return false
        }
    });
    L.Polygon.include({
        intersects: function() {
            var e, t = this._originalPoints,
                n, r, i, s;
            if (this._tooFewPointsForIntersection()) {
                return false
            }
            e = L.Polyline.prototype.intersects.call(this);
            if (e) {
                return true
            }
            n = t.length;
            r = t[0];
            i = t[n - 1];
            s = n - 2;
            return this._lineSegmentsIntersectsRange(i, r, s, 1)
        }
    });
    L.Control.Draw = L.Control.extend({
        options: {
            position: "topleft",
            draw: {},
            edit: false
        },
        initialize: function(e) {
            if (L.version < "0.7") {
                throw new Error("Leaflet.draw 0.2.3+ requires Leaflet 0.7.0+. Download latest from https://github.com/Leaflet/Leaflet/")
            }
            L.Control.prototype.initialize.call(this, e);
            var t, n;
            this._toolbars = {};
            if (L.DrawToolbar && this.options.draw) {
                n = new L.DrawToolbar(this.options.draw);
                t = L.stamp(n);
                this._toolbars[t] = n;
                this._toolbars[t].on("enable", this._toolbarEnabled, this)
            }
            if (L.EditToolbar && this.options.edit) {
                n = new L.EditToolbar(this.options.edit);
                t = L.stamp(n);
                this._toolbars[t] = n;
                this._toolbars[t].on("enable", this._toolbarEnabled, this)
            }
        },
        onAdd: function(e) {
            var t = L.DomUtil.create("div", "leaflet-draw"),
                n = false,
                r = "leaflet-draw-toolbar-top",
                i;
            for (var s in this._toolbars) {
                if (this._toolbars.hasOwnProperty(s)) {
                    i = this._toolbars[s].addToolbar(e);
                    if (i) {
                        if (!n) {
                            if (!L.DomUtil.hasClass(i, r)) {
                                L.DomUtil.addClass(i.childNodes[0], r)
                            }
                            n = true
                        }
                        t.appendChild(i)
                    }
                }
            }
            return t
        },
        onRemove: function() {
            for (var e in this._toolbars) {
                if (this._toolbars.hasOwnProperty(e)) {
                    this._toolbars[e].removeToolbar()
                }
            }
        },
        setDrawingOptions: function(e) {
            for (var t in this._toolbars) {
                if (this._toolbars[t] instanceof L.DrawToolbar) {
                    this._toolbars[t].setOptions(e)
                }
            }
        },
        _toolbarEnabled: function(e) {
            var t = "" + L.stamp(e.target);
            for (var n in this._toolbars) {
                if (this._toolbars.hasOwnProperty(n) && n !== t) {
                    this._toolbars[n].disable()
                }
            }
        }
    });
    L.Map.mergeOptions({
        drawControlTooltips: true,
        drawControl: false
    });
    L.Map.addInitHook(function() {
        if (this.options.drawControl) {
            this.drawControl = new L.Control.Draw;
            this.addControl(this.drawControl)
        }
    });
    L.Toolbar = L.Class.extend({
        includes: [L.Mixin.Events],
        initialize: function(e) {
            L.setOptions(this, e);
            this._modes = {};
            this._actionButtons = [];
            this._activeMode = null
        },
        enabled: function() {
            return this._activeMode !== null
        },
        disable: function() {
            if (!this.enabled()) {
                return
            }
            this._activeMode.handler.disable()
        },
        addToolbar: function(e) {
            var t = L.DomUtil.create("div", "leaflet-draw-section"),
                n = 0,
                r = this._toolbarClass || "",
                i = this.getModeHandlers(e),
                s;
            this._toolbarContainer = L.DomUtil.create("div", "leaflet-draw-toolbar leaflet-bar");
            this._map = e;
            for (s = 0; s < i.length; s++) {
                if (i[s].enabled) {
                    this._initModeHandler(i[s].handler, this._toolbarContainer, n++, r, i[s].title)
                }
            }
            if (!n) {
                return
            }
            this._lastButtonIndex = --n;
            this._actionsContainer = L.DomUtil.create("ul", "leaflet-draw-actions");
            t.appendChild(this._toolbarContainer);
            t.appendChild(this._actionsContainer);
            return t
        },
        removeToolbar: function() {
            for (var e in this._modes) {
                if (this._modes.hasOwnProperty(e)) {
                    this._disposeButton(this._modes[e].button, this._modes[e].handler.enable, this._modes[e].handler);
                    this._modes[e].handler.disable();
                    this._modes[e].handler.off("enabled", this._handlerActivated, this).off("disabled", this._handlerDeactivated, this)
                }
            }
            this._modes = {};
            for (var t = 0, n = this._actionButtons.length; t < n; t++) {
                this._disposeButton(this._actionButtons[t].button, this._actionButtons[t].callback, this)
            }
            this._actionButtons = [];
            this._actionsContainer = null
        },
        _initModeHandler: function(e, t, n, r, i) {
            var s = e.type;
            this._modes[s] = {};
            this._modes[s].handler = e;
            this._modes[s].button = this._createButton({
                title: i,
                className: r + "-" + s,
                container: t,
                callback: this._modes[s].handler.enable,
                context: this._modes[s].handler
            });
            this._modes[s].buttonIndex = n;
            this._modes[s].handler.on("enabled", this._handlerActivated, this).on("disabled", this._handlerDeactivated, this)
        },
        _createButton: function(e) {
            var t = L.DomUtil.create("a", e.className || "", e.container);
            t.href = "#";
            if (e.text) {
                t.innerHTML = e.text
            }
            if (e.title) {
                t.title = e.title
            }
            L.DomEvent.on(t, "click", L.DomEvent.stopPropagation).on(t, "mousedown", L.DomEvent.stopPropagation).on(t, "dblclick", L.DomEvent.stopPropagation).on(t, "click", L.DomEvent.preventDefault).on(t, "click", e.callback, e.context);
            return t
        },
        _disposeButton: function(e, t) {
            L.DomEvent.off(e, "click", L.DomEvent.stopPropagation).off(e, "mousedown", L.DomEvent.stopPropagation).off(e, "dblclick", L.DomEvent.stopPropagation).off(e, "click", L.DomEvent.preventDefault).off(e, "click", t)
        },
        _handlerActivated: function(e) {
            this.disable();
            this._activeMode = this._modes[e.handler];
            L.DomUtil.addClass(this._activeMode.button, "leaflet-draw-toolbar-button-enabled");
            this._showActionsToolbar();
            this.fire("enable")
        },
        _handlerDeactivated: function() {
            this._hideActionsToolbar();
            L.DomUtil.removeClass(this._activeMode.button, "leaflet-draw-toolbar-button-enabled");
            this._activeMode = null;
            this.fire("disable")
        },
        _createActions: function(e) {
            var t = this._actionsContainer,
                n = this.getActions(e),
                r = n.length,
                i, s, o, u;
            for (s = 0, o = this._actionButtons.length; s < o; s++) {
                this._disposeButton(this._actionButtons[s].button, this._actionButtons[s].callback)
            }
            this._actionButtons = [];
            while (t.firstChild) {
                t.removeChild(t.firstChild)
            }
            for (var a = 0; a < r; a++) {
                if ("enabled" in n[a] && !n[a].enabled) {
                    continue
                }
                i = L.DomUtil.create("li", "", t);
                u = this._createButton({
                    title: n[a].title,
                    text: n[a].text,
                    container: i,
                    callback: n[a].callback,
                    context: n[a].context
                });
                this._actionButtons.push({
                    button: u,
                    callback: n[a].callback
                })
            }
        },
        _showActionsToolbar: function() {
            var e = this._activeMode.buttonIndex,
                t = this._lastButtonIndex,
                n = this._activeMode.button.offsetTop - 1;
            this._createActions(this._activeMode.handler);
            this._actionsContainer.style.top = n + "px";
            if (e === 0) {
                L.DomUtil.addClass(this._toolbarContainer, "leaflet-draw-toolbar-notop");
                L.DomUtil.addClass(this._actionsContainer, "leaflet-draw-actions-top")
            }
            if (e === t) {
                L.DomUtil.addClass(this._toolbarContainer, "leaflet-draw-toolbar-nobottom");
                L.DomUtil.addClass(this._actionsContainer, "leaflet-draw-actions-bottom")
            }
            this._actionsContainer.style.display = "block"
        },
        _hideActionsToolbar: function() {
            this._actionsContainer.style.display = "none";
            L.DomUtil.removeClass(this._toolbarContainer, "leaflet-draw-toolbar-notop");
            L.DomUtil.removeClass(this._toolbarContainer, "leaflet-draw-toolbar-nobottom");
            L.DomUtil.removeClass(this._actionsContainer, "leaflet-draw-actions-top");
            L.DomUtil.removeClass(this._actionsContainer, "leaflet-draw-actions-bottom")
        }
    });
    L.Tooltip = L.Class.extend({
        initialize: function(e) {
            this._map = e;
            this._popupPane = e._panes.popupPane;
            this._container = e.options.drawControlTooltips ? L.DomUtil.create("div", "leaflet-draw-tooltip", this._popupPane) : null;
            this._singleLineLabel = false
        },
        dispose: function() {
            if (this._container) {
                this._popupPane.removeChild(this._container);
                this._container = null
            }
        },
        updateContent: function(e) {
            if (!this._container) {
                return this
            }
            e.subtext = e.subtext || "";
            if (e.subtext.length === 0 && !this._singleLineLabel) {
                L.DomUtil.addClass(this._container, "leaflet-draw-tooltip-single");
                this._singleLineLabel = true
            } else if (e.subtext.length > 0 && this._singleLineLabel) {
                L.DomUtil.removeClass(this._container, "leaflet-draw-tooltip-single");
                this._singleLineLabel = false
            }
            this._container.innerHTML = (e.subtext.length > 0 ? '<span class="leaflet-draw-tooltip-subtext">' + e.subtext + "</span>" + "<br />" : "") + "<span>" + e.text + "</span>";
            return this
        },
        updatePosition: function(e) {
            var t = this._map.latLngToLayerPoint(e),
                n = this._container;
            if (this._container) {
                n.style.visibility = "inherit";
                L.DomUtil.setPosition(n, t)
            }
            return this
        },
        showAsError: function() {
            if (this._container) {
                L.DomUtil.addClass(this._container, "leaflet-error-draw-tooltip")
            }
            return this
        },
        removeError: function() {
            if (this._container) {
                L.DomUtil.removeClass(this._container, "leaflet-error-draw-tooltip")
            }
            return this
        }
    });
    L.DrawToolbar = L.Toolbar.extend({
        options: {
            polyline: {},
            polygon: {},
            rectangle: {},
            circle: {},
            marker: {}
        },
        initialize: function(e) {
            for (var t in this.options) {
                if (this.options.hasOwnProperty(t)) {
                    if (e[t]) {
                        e[t] = L.extend({}, this.options[t], e[t])
                    }
                }
            }
            this._toolbarClass = "leaflet-draw-draw";
            L.Toolbar.prototype.initialize.call(this, e)
        },
        getModeHandlers: function(e) {
            return [{
                enabled: this.options.polyline,
                handler: new L.Draw.Polyline(e, this.options.polyline),
                title: L.drawLocal.draw.toolbar.buttons.polyline
            }, {
                enabled: this.options.polygon,
                handler: new L.Draw.Polygon(e, this.options.polygon),
                title: L.drawLocal.draw.toolbar.buttons.polygon
            }, {
                enabled: this.options.rectangle,
                handler: new L.Draw.Rectangle(e, this.options.rectangle),
                title: L.drawLocal.draw.toolbar.buttons.rectangle
            }, {
                enabled: this.options.circle,
                handler: new L.Draw.Circle(e, this.options.cicle),
                title: L.drawLocal.draw.toolbar.buttons.circle
            }, {
                enabled: this.options.marker,
                handler: new L.Draw.Marker(e, this.options.marker),
                title: L.drawLocal.draw.toolbar.buttons.marker
            }, {
                enabled: this.options.markertouch,
                handler: new L.Draw.MarkerTouch(e, this.options.marker),
                title: L.drawLocal.draw.toolbar.buttons.marker
            }]
        },
        getActions: function(e) {
            return [{
                enabled: e.deleteLastVertex,
                title: L.drawLocal.draw.toolbar.undo.title,
                text: L.drawLocal.draw.toolbar.undo.text,
                callback: e.deleteLastVertex,
                context: e
            }, {
                title: L.drawLocal.draw.toolbar.actions.title,
                text: L.drawLocal.draw.toolbar.actions.text,
                callback: this.disable,
                context: this
            }]
        },
        setOptions: function(e) {
            L.setOptions(this, e);
            for (var t in this._modes) {
                if (this._modes.hasOwnProperty(t) && e.hasOwnProperty(t)) {
                    this._modes[t].handler.setOptions(e[t])
                }
            }
        }
    });
    L.EditToolbar = L.Toolbar.extend({
        options: {
            edit: {
                selectedPathOptions: {
                    color: "#fe57a1",
                    opacity: .6,
                    dashArray: "10, 10",
                    fill: true,
                    fillColor: "#fe57a1",
                    fillOpacity: .1
                }
            },
            remove: {},
            featureGroup: null
        },
        initialize: function(e) {
            if (e.edit) {
                if (typeof e.edit.selectedPathOptions === "undefined") {
                    e.edit.selectedPathOptions = this.options.edit.selectedPathOptions
                }
                e.edit = L.extend({}, this.options.edit, e.edit)
            }
            if (e.remove) {
                e.remove = L.extend({}, this.options.remove, e.remove)
            }
            this._toolbarClass = "leaflet-draw-edit";
            L.Toolbar.prototype.initialize.call(this, e);
            this._selectedFeatureCount = 0
        },
        getModeHandlers: function(e) {
            var t = this.options.featureGroup;
            return [{
                enabled: this.options.edit,
                handler: new L.EditToolbar.Edit(e, {
                    featureGroup: t,
                    selectedPathOptions: this.options.edit.selectedPathOptions
                }),
                title: L.drawLocal.edit.toolbar.buttons.edit
            }, {
                enabled: this.options.remove,
                handler: new L.EditToolbar.Delete(e, {
                    featureGroup: t
                }),
                title: L.drawLocal.edit.toolbar.buttons.remove
            }]
        },
        getActions: function() {
            return [{
                title: L.drawLocal.edit.toolbar.actions.save.title,
                text: L.drawLocal.edit.toolbar.actions.save.text,
                callback: this._save,
                context: this
            }, {
                title: L.drawLocal.edit.toolbar.actions.cancel.title,
                text: L.drawLocal.edit.toolbar.actions.cancel.text,
                callback: this.disable,
                context: this
            }]
        },
        addToolbar: function(e) {
            var t = L.Toolbar.prototype.addToolbar.call(this, e);
            this._checkDisabled();
            this.options.featureGroup.on("layeradd layerremove", this._checkDisabled, this);
            return t
        },
        removeToolbar: function() {
            this.options.featureGroup.off("layeradd layerremove", this._checkDisabled, this);
            L.Toolbar.prototype.removeToolbar.call(this)
        },
        disable: function() {
            if (!this.enabled()) {
                return
            }
            this._activeMode.handler.revertLayers();
            L.Toolbar.prototype.disable.call(this)
        },
        _save: function() {
            this._activeMode.handler.save();
            this._activeMode.handler.disable()
        },
        _checkDisabled: function() {
            var e = this.options.featureGroup,
                t = e.getLayers().length !== 0,
                n;
            if (this.options.edit) {
                n = this._modes[L.EditToolbar.Edit.TYPE].button;
                if (t) {
                    L.DomUtil.removeClass(n, "leaflet-disabled")
                } else {
                    L.DomUtil.addClass(n, "leaflet-disabled")
                }
                n.setAttribute("title", t ? L.drawLocal.edit.toolbar.buttons.edit : L.drawLocal.edit.toolbar.buttons.editDisabled)
            }
            if (this.options.remove) {
                n = this._modes[L.EditToolbar.Delete.TYPE].button;
                if (t) {
                    L.DomUtil.removeClass(n, "leaflet-disabled")
                } else {
                    L.DomUtil.addClass(n, "leaflet-disabled")
                }
                n.setAttribute("title", t ? L.drawLocal.edit.toolbar.buttons.remove : L.drawLocal.edit.toolbar.buttons.removeDisabled)
            }
        }
    });
    L.EditToolbar.Edit = L.Handler.extend({
        statics: {
            TYPE: "edit"
        },
        includes: L.Mixin.Events,
        initialize: function(e, t) {
            L.Handler.prototype.initialize.call(this, e);
            this._selectedPathOptions = t.selectedPathOptions;
            this._featureGroup = t.featureGroup;
            if (!(this._featureGroup instanceof L.FeatureGroup)) {
                throw new Error("options.featureGroup must be a L.FeatureGroup")
            }
            this._uneditedLayerProps = {};
            this.type = L.EditToolbar.Edit.TYPE
        },
        enable: function() {
            if (this._enabled || !this._hasAvailableLayers()) {
                return
            }
            this.fire("enabled", {
                handler: this.type
            });
            this._map.fire("draw:editstart", {
                handler: this.type
            });
            L.Handler.prototype.enable.call(this);
            this._featureGroup.on("layeradd", this._enableLayerEdit, this).on("layerremove", this._disableLayerEdit, this)
        },
        disable: function() {
            if (!this._enabled) {
                return
            }
            this._featureGroup.off("layeradd", this._enableLayerEdit, this).off("layerremove", this._disableLayerEdit, this);
            L.Handler.prototype.disable.call(this);
            this._map.fire("draw:editstop", {
                handler: this.type
            });
            this.fire("disabled", {
                handler: this.type
            })
        },
        addHooks: function() {
            var e = this._map;
            if (e) {
                e.getContainer().focus();
                this._featureGroup.eachLayer(this._enableLayerEdit, this);
                this._tooltip = new L.Tooltip(this._map);
                this._tooltip.updateContent({
                    text: L.drawLocal.edit.handlers.edit.tooltip.text,
                    subtext: L.drawLocal.edit.handlers.edit.tooltip.subtext
                });
                this._map.on("mousemove", this._onMouseMove, this)
            }
        },
        removeHooks: function() {
            if (this._map) {
                this._featureGroup.eachLayer(this._disableLayerEdit, this);
                this._uneditedLayerProps = {};
                this._tooltip.dispose();
                this._tooltip = null;
                this._map.off("mousemove", this._onMouseMove, this)
            }
        },
        revertLayers: function() {
            this._featureGroup.eachLayer(function(e) {
                this._revertLayer(e)
            }, this)
        },
        save: function() {
            var e = new L.LayerGroup;
            this._featureGroup.eachLayer(function(t) {
                if (t.edited) {
                    e.addLayer(t);
                    t.edited = false
                }
            });
            this._map.fire("draw:edited", {
                layers: e
            })
        },
        _backupLayer: function(e) {
            var t = L.Util.stamp(e);
            if (!this._uneditedLayerProps[t]) {
                if (e instanceof L.Polyline || e instanceof L.Polygon || e instanceof L.Rectangle) {
                    this._uneditedLayerProps[t] = {
                        latlngs: L.LatLngUtil.cloneLatLngs(e.getLatLngs())
                    }
                } else if (e instanceof L.Circle) {
                    this._uneditedLayerProps[t] = {
                        latlng: L.LatLngUtil.cloneLatLng(e.getLatLng()),
                        radius: e.getRadius()
                    }
                } else {
                    this._uneditedLayerProps[t] = {
                        latlng: L.LatLngUtil.cloneLatLng(e.getLatLng())
                    }
                }
            }
        },
        _revertLayer: function(e) {
            var t = L.Util.stamp(e);
            e.edited = false;
            if (this._uneditedLayerProps.hasOwnProperty(t)) {
                if (e instanceof L.Polyline || e instanceof L.Polygon || e instanceof L.Rectangle) {
                    e.setLatLngs(this._uneditedLayerProps[t].latlngs)
                } else if (e instanceof L.Circle) {
                    e.setLatLng(this._uneditedLayerProps[t].latlng);
                    e.setRadius(this._uneditedLayerProps[t].radius)
                } else {
                    e.setLatLng(this._uneditedLayerProps[t].latlng)
                }
            }
        },
        _toggleMarkerHighlight: function(e) {
            if (!e._icon) {
                return
            }
            var t = e._icon;
            t.style.display = "none";
            if (L.DomUtil.hasClass(t, "leaflet-edit-marker-selected")) {
                L.DomUtil.removeClass(t, "leaflet-edit-marker-selected");
                this._offsetMarker(t, -4)
            } else {
                L.DomUtil.addClass(t, "leaflet-edit-marker-selected");
                this._offsetMarker(t, 4)
            }
            t.style.display = ""
        },
        _offsetMarker: function(e, t) {
            var n = parseInt(e.style.marginTop, 10) - t,
                r = parseInt(e.style.marginLeft, 10) - t;
            e.style.marginTop = n + "px";
            e.style.marginLeft = r + "px"
        },
        _enableLayerEdit: function(e) {
            var t = e.layer || e.target || e,
                n = t instanceof L.Marker,
                r;
            if (n && !t._icon) {
                return
            }
            this._backupLayer(t);
            if (this._selectedPathOptions) {
                r = L.Util.extend({}, this._selectedPathOptions);
                if (n) {
                    this._toggleMarkerHighlight(t)
                } else {
                    t.options.previousOptions = L.Util.extend({
                        dashArray: null
                    }, t.options);
                    if (!(t instanceof L.Circle) && !(t instanceof L.Polygon) && !(t instanceof L.Rectangle)) {
                        r.fill = false
                    }
                    t.setStyle(r)
                }
            }
            if (n) {
                t.dragging.enable();
                t.on("dragend", this._onMarkerDragEnd)
            } else {
                t.editing.enable()
            }
        },
        _disableLayerEdit: function(e) {
            var t = e.layer || e.target || e;
            t.edited = false;
            if (this._selectedPathOptions) {
                if (t instanceof L.Marker) {
                    this._toggleMarkerHighlight(t)
                } else {
                    t.setStyle(t.options.previousOptions);
                    delete t.options.previousOptions
                }
            }
            if (t instanceof L.Marker) {
                t.dragging.disable();
                t.off("dragend", this._onMarkerDragEnd, this)
            } else {
                t.editing.disable()
            }
        },
        _onMarkerDragEnd: function(e) {
            var t = e.target;
            t.edited = true
        },
        _onMouseMove: function(e) {
            this._tooltip.updatePosition(e.latlng)
        },
        _hasAvailableLayers: function() {
            return this._featureGroup.getLayers().length !== 0
        }
    });
    L.EditToolbar.Delete = L.Handler.extend({
        statics: {
            TYPE: "remove"
        },
        includes: L.Mixin.Events,
        initialize: function(e, t) {
            L.Handler.prototype.initialize.call(this, e);
            L.Util.setOptions(this, t);
            this._deletableLayers = this.options.featureGroup;
            if (!(this._deletableLayers instanceof L.FeatureGroup)) {
                throw new Error("options.featureGroup must be a L.FeatureGroup")
            }
            this.type = L.EditToolbar.Delete.TYPE
        },
        enable: function() {
            if (this._enabled || !this._hasAvailableLayers()) {
                return
            }
            this.fire("enabled", {
                handler: this.type
            });
            L.Handler.prototype.enable.call(this);
            this._deletableLayers.on("layeradd", this._enableLayerDelete, this).on("layerremove", this._disableLayerDelete, this);
            this._map.fire("draw:deletestart", {
                handler: this.type
            })
        },
        disable: function() {
            if (!this._enabled) {
                return
            }
            this._deletableLayers.off("layeradd", this._enableLayerDelete, this).off("layerremove", this._disableLayerDelete, this);
            L.Handler.prototype.disable.call(this);
            this._map.fire("draw:deletestop", {
                handler: this.type
            });
            this.fire("disabled", {
                handler: this.type
            })
        },
        addHooks: function() {
            var e = this._map;
            if (e) {
                e.getContainer().focus();
                this._deletableLayers.eachLayer(this._enableLayerDelete, this);
                this._deletedLayers = new L.layerGroup;
                this._tooltip = new L.Tooltip(this._map);
                this._tooltip.updateContent({
                    text: L.drawLocal.edit.handlers.remove.tooltip.text
                });
                this._map.on("mousemove", this._onMouseMove, this)
            }
        },
        removeHooks: function() {
            if (this._map) {
                this._deletableLayers.eachLayer(this._disableLayerDelete, this);
                this._deletedLayers = null;
                this._tooltip.dispose();
                this._tooltip = null;
                this._map.off("mousemove", this._onMouseMove, this)
            }
        },
        revertLayers: function() {
            this._deletedLayers.eachLayer(function(e) {
                this._deletableLayers.addLayer(e)
            }, this)
        },
        save: function() {
            this._map.fire("draw:deleted", {
                layers: this._deletedLayers
            })
        },
        _enableLayerDelete: function(e) {
            var t = e.layer || e.target || e;
            t.on("click", this._removeLayer, this)
        },
        _disableLayerDelete: function(e) {
            var t = e.layer || e.target || e;
            t.off("click", this._removeLayer, this);
            this._deletedLayers.removeLayer(t)
        },
        _removeLayer: function(e) {
            var t = e.layer || e.target || e;
            this._deletableLayers.removeLayer(t);
            this._deletedLayers.addLayer(t)
        },
        _onMouseMove: function(e) {
            this._tooltip.updatePosition(e.latlng)
        },
        _hasAvailableLayers: function() {
            return this._deletableLayers.getLayers().length !== 0
        }
    })
})(window, document)